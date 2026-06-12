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

test('passesAcceptedGate_: off (default) passes regardless of RSVP', () => {
  const g = gas();
  const invited = timedEvent({ attendees: [{ email: 'me@x.com', self: true, responseStatus: 'needsAction' }] });
  assert.equal(g.passesAcceptedGate_(invited, mapping({ acceptedOnly: false })), true);
});

test('passesAcceptedGate_: only accepted invitations pass when on', () => {
  const g = gas();
  const m = mapping({ acceptedOnly: true });
  const self = (status) => timedEvent({ attendees: [{ email: 'me@x.com', self: true, responseStatus: status }] });
  assert.equal(g.passesAcceptedGate_(self('accepted'), m), true);
  assert.equal(g.passesAcceptedGate_(self('needsAction'), m), false);
  assert.equal(g.passesAcceptedGate_(self('tentative'), m), false);
  assert.equal(g.passesAcceptedGate_(self('declined'), m), false);
});

test('passesAcceptedGate_: non-invitations pass (no self attendee / no attendees)', () => {
  const g = gas();
  const m = mapping({ acceptedOnly: true });
  assert.equal(g.passesAcceptedGate_(timedEvent(), m), true); // no attendees — your own event
  // attendees present but none is "self" (e.g. you organize, others are invited)
  const othersOnly = timedEvent({ attendees: [{ email: 'guest@x.com', responseStatus: 'needsAction' }] });
  assert.equal(g.passesAcceptedGate_(othersOnly, m), true);
});

test('qualifies: acceptedOnly vetoes an unaccepted invitation', () => {
  const g = gas();
  const pending = timedEvent({ summary: 'Invite', attendees: [{ email: 'me@x.com', self: true, responseStatus: 'needsAction' }] });
  assert.equal(g.qualifies(pending, mapping()), true);                       // gate off
  assert.equal(g.qualifies(pending, mapping({ acceptedOnly: true })), false); // gate on
});
