const test = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./harness/load');
const { makeEnv, mapping, timedEvent } = require('./harness/fakes');

function gas() { return loadGas(makeEnv().globals); }

test('full mode: prefix + source title, copies description/location', () => {
  const g = gas();
  const r = g.buildCopyResource(timedEvent({ summary: 'Sync', description: 'notes', location: 'Room 1' }), mapping({ titlePrefix: '[A] ' }));
  assert.equal(r.summary, '[A] Sync');
  assert.equal(r.description, 'notes');
  assert.equal(r.location, 'Room 1');
});

test('full mode: missing title becomes (no title)', () => {
  const g = gas();
  const r = g.buildCopyResource(timedEvent({ summary: undefined }), mapping());
  assert.equal(r.summary, '(no title)');
});

test('busy mode: opaque "Busy" block with no details, private', () => {
  const g = gas();
  const r = g.buildCopyResource(timedEvent({ summary: 'Secret', description: 'x', location: 'y' }), mapping({ copyMode: 'busy' }));
  assert.equal(r.summary, 'Busy');
  assert.equal(r.visibility, 'private');
  assert.equal(r.description, undefined);
  assert.equal(r.location, undefined);
});

test('overrideTitle replaces the title in full mode (prefix still applies)', () => {
  const g = gas();
  const r = g.buildCopyResource(timedEvent({ summary: 'Real title' }), mapping({ overrideTitle: 'Busy block', titlePrefix: '[A] ' }));
  assert.equal(r.summary, '[A] Busy block');
});

test('overrideTitle replaces "Busy" in busy mode', () => {
  const g = gas();
  const r = g.buildCopyResource(timedEvent(), mapping({ copyMode: 'busy', overrideTitle: 'Out' }));
  assert.equal(r.summary, 'Out');
});

test('attendees are never copied; reminders off; transparency opaque', () => {
  const g = gas();
  const r = g.buildCopyResource(timedEvent({ attendees: [{ email: 'a@x.com' }, { email: 'b@y.com' }] }), mapping());
  assert.equal(r.attendees, undefined);
  assert.deepEqual(r.reminders, { useDefault: false });
  assert.equal(r.transparency, 'opaque');
});

test('recurrence preserved when present, absent otherwise', () => {
  const g = gas();
  const rec = ['RRULE:FREQ=WEEKLY'];
  assert.deepEqual(g.buildCopyResource(timedEvent({ recurrence: rec }), mapping()).recurrence, rec);
  assert.equal(g.buildCopyResource(timedEvent(), mapping()).recurrence, undefined);
});

test('stamps source/sourceEvent/mapping in private properties', () => {
  const g = gas();
  const r = g.buildCopyResource(timedEvent({ id: 'e123' }), mapping({ id: 'mX', sourceCalId: 'src@cal' }));
  const p = r.extendedProperties.private;
  assert.equal(p.csSource, 'src@cal');
  assert.equal(p.csSourceEventId, 'e123');
  assert.equal(p.csMapping, 'mX');
});

test('all-day events: start.date passed through', () => {
  const g = gas();
  const r = g.buildCopyResource({ id: 'd1', summary: 'Holiday', start: { date: '2026-07-04' }, end: { date: '2026-07-05' } }, mapping());
  assert.deepEqual(r.start, { date: '2026-07-04' });
  assert.deepEqual(r.end, { date: '2026-07-05' });
});

test('color: a color name resolves to its Calendar colorId', () => {
  const g = gas();
  assert.equal(g.buildCopyResource(timedEvent(), mapping({ color: 'Tomato' })).colorId, '11');
  assert.equal(g.buildCopyResource(timedEvent(), mapping({ color: 'lavender' })).colorId, '1'); // case-insensitive
});

test('color: a raw numeric id 1-11 passes through', () => {
  const g = gas();
  assert.equal(g.buildCopyResource(timedEvent(), mapping({ color: '5' })).colorId, '5');
});

test('color: blank or unknown leaves colorId unset (calendar default)', () => {
  const g = gas();
  assert.equal(g.buildCopyResource(timedEvent(), mapping({ color: '' })).colorId, undefined);
  assert.equal(g.buildCopyResource(timedEvent(), mapping({ color: 'chartreuse' })).colorId, undefined);
  assert.equal(g.buildCopyResource(timedEvent(), mapping({ color: '12' })).colorId, undefined); // out of range
});

test('color applies in busy mode too', () => {
  const g = gas();
  const r = g.buildCopyResource(timedEvent(), mapping({ copyMode: 'busy', color: 'Basil' }));
  assert.equal(r.summary, 'Busy');
  assert.equal(r.colorId, '10');
});
