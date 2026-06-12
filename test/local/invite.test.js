const test = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./harness/load');
const { makeEnv, mapping, timedEvent } = require('./harness/fakes');

const SRC = 'src@cal';
const DST = 'dst@cal';

function setup(over) {
  const env = makeEnv();
  const g = loadGas(env.globals);
  const m = mapping(Object.assign({ sourceCalId: SRC, destCalId: DST, copyMode: 'invite' }, over || {}));
  return { env, g, m };
}

/** The current (live) source event resource for an id. */
function srcEvent(env, id) {
  return env.cal.all(SRC).find(function (e) { return e.id === id; });
}

test('invite: a qualifying source event gets the destination added as an attendee', () => {
  const { env, g, m } = setup();
  env.cal.seed(SRC, timedEvent({ id: 'e1' }));
  const r = g.syncMapping(m, false);
  assert.equal(r.created, 1);
  // No copy is written to the destination.
  assert.equal(env.cal.live(DST).length, 0);
  // The source event now carries the destination as an attendee.
  const ev = srcEvent(env, 'e1');
  assert.deepEqual(ev.attendees, [{ email: DST }]);
});

test('invite: existing source attendees are preserved and no one is notified', () => {
  const { env, g, m } = setup();
  env.cal.seed(SRC, timedEvent({ id: 'e1', attendees: [{ email: 'colleague@example.com' }] }));

  // Spy on patch to assert sendUpdates:'none'.
  let patchOpts = null;
  const realPatch = env.globals.Calendar.Events.patch;
  env.globals.Calendar.Events.patch = function (resource, calId, eventId, opts) {
    patchOpts = opts;
    return realPatch(resource, calId, eventId, opts);
  };

  g.syncMapping(m, false);
  const ev = srcEvent(env, 'e1');
  const emails = ev.attendees.map(function (a) { return a.email; }).sort();
  assert.deepEqual(emails, ['colleague@example.com', DST]);
  assert.deepEqual(patchOpts, { sendUpdates: 'none' });
});

test('invite idempotency: a second run does nothing when already invited', () => {
  const { env, g, m } = setup();
  env.cal.seed(SRC, timedEvent({ id: 'e1' }));
  g.syncMapping(m, false);
  // Re-seed (same id) to force the event back through the incremental delta.
  env.cal.seed(SRC, timedEvent({ id: 'e1', attendees: [{ email: DST }] }));
  const r = g.syncMapping(m, false);
  assert.deepEqual([r.created, r.updated, r.deleted], [0, 0, 0]);
  assert.equal(srcEvent(env, 'e1').attendees.length, 1);
});

test('invite stale cleanup: an event edited out of the qualifying set loses the attendee', () => {
  const { env, g, m } = setup({ busyOnly: true });
  env.cal.seed(SRC, timedEvent({ id: 'e1', transparency: 'opaque' }));
  g.syncMapping(m, false);
  assert.deepEqual(srcEvent(env, 'e1').attendees, [{ email: DST }]);

  env.cal.seed(SRC, timedEvent({ id: 'e1', transparency: 'transparent', attendees: [{ email: DST }] }));
  const r = g.syncMapping(m, false);
  assert.equal(r.deleted, 1);
  assert.deepEqual(srcEvent(env, 'e1').attendees, []);
});

test('invite: a cancelled source event needs no cleanup', () => {
  const { env, g, m } = setup();
  env.cal.seed(SRC, timedEvent({ id: 'e1' }));
  g.syncMapping(m, false);
  env.cal.cancel(SRC, 'e1');
  const r = g.syncMapping(m, false);
  assert.equal(r.deleted, 0);
  assert.equal(r.errors, 0);
});

test('invite dryRun: counts but does not modify the source event or persist a token', () => {
  const { env, g, m } = setup();
  env.cal.seed(SRC, timedEvent({ id: 'e1' }));
  const r = g.syncMapping(m, true);
  assert.equal(r.created, 1);
  assert.equal(srcEvent(env, 'e1').attendees, undefined); // untouched
  assert.equal(g.getSyncToken(m.id), null);
});

test('invite: "primary" destination resolves to the account email as the attendee', () => {
  const { env, g, m } = setup({ destCalId: 'primary' });
  env.cal.seed(SRC, timedEvent({ id: 'e1' }));
  g.syncMapping(m, false);
  assert.deepEqual(srcEvent(env, 'e1').attendees, [{ email: 'me@primary.example' }]);
});

// --- invite + color: color the destination's own copy of the invited event ---
// The fake doesn't model invitation propagation, so tests seed a destination
// event with the same id as the source event to stand in for the propagated copy.

function dstEvent(env, id) {
  return env.cal.all(DST).find(function (e) { return e.id === id; });
}

test('invite color: colors the destination copy when a color is set and dest is writable', () => {
  const { env, g, m } = setup({ color: 'Tomato' });
  env.cal.seed(SRC, timedEvent({ id: 'e1', attendees: [{ email: DST }] })); // already invited
  env.cal.seed(DST, timedEvent({ id: 'e1' }));                              // propagated copy
  const r = g.syncMapping(m, false);
  assert.equal(r.created, 0);
  assert.equal(r.updated, 1);
  assert.equal(dstEvent(env, 'e1').colorId, '11');     // Tomato on the destination
  assert.equal(srcEvent(env, 'e1').colorId, undefined); // source/organizer untouched
});

test('invite color: applies on the first invite too (attendee added + colored)', () => {
  const { env, g, m } = setup({ color: 'Tomato' });
  env.cal.seed(SRC, timedEvent({ id: 'e1' }));     // not yet invited
  env.cal.seed(DST, timedEvent({ id: 'e1' }));     // copy already present
  const r = g.syncMapping(m, false);
  assert.equal(r.created, 1);                      // attendee added
  assert.equal(dstEvent(env, 'e1').colorId, '11');
});

test('invite color: changing the mapping color re-patches the destination copy', () => {
  const { env, g, m } = setup({ color: 'Sage' });
  env.cal.seed(SRC, timedEvent({ id: 'e1', attendees: [{ email: DST }] }));
  env.cal.seed(DST, timedEvent({ id: 'e1', colorId: '11' })); // was Tomato
  const r = g.syncMapping(m, false);
  assert.equal(r.updated, 1);
  assert.equal(dstEvent(env, 'e1').colorId, '2'); // Sage
});

test('invite color: already-correct color is a no-op (no count)', () => {
  const { env, g, m } = setup({ color: 'Tomato' });
  env.cal.seed(SRC, timedEvent({ id: 'e1', attendees: [{ email: DST }] }));
  env.cal.seed(DST, timedEvent({ id: 'e1', colorId: '11' }));
  const r = g.syncMapping(m, false);
  assert.deepEqual([r.created, r.updated, r.deleted], [0, 0, 0]);
  assert.equal(dstEvent(env, 'e1').colorId, '11');
});

test('invite color: no edit access on the destination -> color not applied', () => {
  const { env, g, m } = setup({ color: 'Tomato' });
  env.cal.setAccessRole(DST, 'reader');
  env.cal.seed(SRC, timedEvent({ id: 'e1', attendees: [{ email: DST }] }));
  env.cal.seed(DST, timedEvent({ id: 'e1' }));
  const r = g.syncMapping(m, false);
  assert.equal(r.updated, 0);
  assert.equal(dstEvent(env, 'e1').colorId, undefined);
});

test('invite color: blank color leaves the destination copy untouched', () => {
  const { env, g, m } = setup({ color: '' });
  env.cal.seed(SRC, timedEvent({ id: 'e1', attendees: [{ email: DST }] }));
  env.cal.seed(DST, timedEvent({ id: 'e1', colorId: '11' }));
  const r = g.syncMapping(m, false);
  assert.deepEqual([r.created, r.updated, r.deleted], [0, 0, 0]);
  assert.equal(dstEvent(env, 'e1').colorId, '11'); // not reset
});

test('invite color: a not-yet-propagated destination copy is skipped without error', () => {
  const { env, g, m } = setup({ color: 'Tomato' });
  env.cal.seed(SRC, timedEvent({ id: 'e1', attendees: [{ email: DST }] }));
  // No DST copy seeded — getEvent_ returns null.
  const r = g.syncMapping(m, false);
  assert.equal(r.errors, 0);
  assert.equal(r.updated, 0);
});

test('invite color dryRun: counts the would-be change but writes nothing', () => {
  const { env, g, m } = setup({ color: 'Tomato' });
  env.cal.seed(SRC, timedEvent({ id: 'e1', attendees: [{ email: DST }] }));
  env.cal.seed(DST, timedEvent({ id: 'e1' }));
  const r = g.syncMapping(m, true);
  assert.equal(r.updated, 1);
  assert.equal(dstEvent(env, 'e1').colorId, undefined); // no write
});
