const test = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./harness/load');
const { makeEnv, mapping, timedEvent } = require('./harness/fakes');

function gas() { return loadGas(makeEnv().globals); }

test('passesTitleFilter_: empty filter passes everything', () => {
  const g = gas();
  assert.equal(g.passesTitleFilter_(timedEvent({ summary: 'Anything' }), mapping({ filter: '' })), true);
});

test('passesTitleFilter_: case-insensitive substring match', () => {
  const g = gas();
  assert.equal(g.passesTitleFilter_(timedEvent({ summary: 'Weekly STANDUP' }), mapping({ filter: 'standup' })), true);
  assert.equal(g.passesTitleFilter_(timedEvent({ summary: 'Lunch' }), mapping({ filter: 'standup' })), false);
});

test('isBusy_: missing/opaque is busy, transparent is free', () => {
  const g = gas();
  assert.equal(g.isBusy_(timedEvent({ transparency: undefined })), true);
  assert.equal(g.isBusy_(timedEvent({ transparency: 'opaque' })), true);
  assert.equal(g.isBusy_(timedEvent({ transparency: 'transparent' })), false);
});

test('creatorExcluded_: empty list excludes nothing', () => {
  const g = gas();
  assert.equal(g.creatorExcluded_(timedEvent(), mapping({ excludeCreators: [] })), false);
});

test('creatorExcluded_: matches creator OR organizer, case-insensitive', () => {
  const g = gas();
  const m = mapping({ excludeCreators: ['boss@acme.com'] });
  assert.equal(g.creatorExcluded_(timedEvent({ creator: { email: 'BOSS@acme.com' }, organizer: { email: 'x@y.com' } }), m), true);
  assert.equal(g.creatorExcluded_(timedEvent({ creator: { email: 'x@y.com' }, organizer: { email: 'Boss@Acme.com' } }), m), true);
  assert.equal(g.creatorExcluded_(timedEvent({ creator: { email: 'x@y.com' }, organizer: { email: 'z@y.com' } }), m), false);
});

test('isOwnMirror: true only when our source-event stamp is present', () => {
  const g = gas();
  assert.equal(g.isOwnMirror(timedEvent()), false);
  assert.equal(g.isOwnMirror(timedEvent({ extendedProperties: { private: { csSourceEventId: 'abc' } } })), true);
  assert.equal(g.isOwnMirror(timedEvent({ extendedProperties: { private: {} } })), false);
});

test('qualifies: each filter can independently veto', () => {
  const g = gas();
  const src = timedEvent({ summary: 'Standup', transparency: 'opaque', creator: { email: 'a@x.com' }, organizer: { email: 'a@x.com' } });
  assert.equal(g.qualifies(src, mapping()), true);
  assert.equal(g.qualifies(src, mapping({ filter: 'nope' })), false);
  assert.equal(g.qualifies(timedEvent({ transparency: 'transparent' }), mapping({ busyOnly: true })), false);
  assert.equal(g.qualifies(src, mapping({ excludeCreators: ['a@x.com'] })), false);
});
