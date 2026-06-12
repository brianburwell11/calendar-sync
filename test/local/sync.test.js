const test = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./harness/load');
const { makeEnv, mapping, timedEvent, sheetWith } = require('./harness/fakes');

const SRC = 'src@cal';
const DST = 'dst@cal';

function setup(over) {
  const env = makeEnv();
  const g = loadGas(env.globals);
  const m = mapping(Object.assign({ sourceCalId: SRC, destCalId: DST }, over || {}));
  return { env, g, m };
}

test('unsupported direction is skipped with no API writes', () => {
  const { env, g, m } = setup({ direction: 'dest_to_source' });
  env.cal.seed(SRC, timedEvent({ id: 'e1' }));
  const r = g.syncMapping(m, false);
  assert.equal(r.created, 0);
  assert.match(r.note, /not yet implemented/);
  assert.equal(env.cal.live(DST).length, 0);
});

test('create: a new source event is mirrored with stamps', () => {
  const { env, g, m } = setup();
  env.cal.seed(SRC, timedEvent({ id: 'e1', summary: 'Standup' }));
  const r = g.syncMapping(m, false);
  assert.equal(r.created, 1);
  const copies = env.cal.live(DST);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].summary, 'Standup');
  assert.equal(copies[0].extendedProperties.private.csSourceEventId, 'e1');
});

test('update: changed source updates the same copy (no duplicate)', () => {
  const { env, g, m } = setup();
  env.cal.seed(SRC, timedEvent({ id: 'e1', summary: 'A' }));
  g.syncMapping(m, false);
  env.cal.seed(SRC, timedEvent({ id: 'e1', summary: 'B' })); // same id, edited
  const r = g.syncMapping(m, false);
  assert.equal(r.updated, 1);
  assert.equal(r.created, 0);
  const copies = env.cal.live(DST);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].summary, 'B');
});

test('delete: cancelled source removes the copy', () => {
  const { env, g, m } = setup();
  env.cal.seed(SRC, timedEvent({ id: 'e1' }));
  g.syncMapping(m, false);
  env.cal.cancel(SRC, 'e1');
  const r = g.syncMapping(m, false);
  assert.equal(r.deleted, 1);
  assert.equal(env.cal.live(DST).length, 0);
});

test('delete with no existing copy is a no-op', () => {
  const { env, g, m } = setup();
  env.cal.seed(SRC, timedEvent({ id: 'e1' }));
  g.syncMapping(m, false);          // first sync establishes token, creates copy
  env.cal.cancel(SRC, 'e1');        // cancel
  g.syncMapping(m, false);          // removes copy (deleted=1)
  const r = g.syncMapping(m, false); // nothing left to do
  assert.equal(r.deleted, 0);
});

test('stale cleanup: event edited out of qualifying set deletes its copy', () => {
  const { env, g, m } = setup({ busyOnly: true });
  env.cal.seed(SRC, timedEvent({ id: 'e1', transparency: 'opaque' }));
  g.syncMapping(m, false);
  assert.equal(env.cal.live(DST).length, 1);
  env.cal.seed(SRC, timedEvent({ id: 'e1', transparency: 'transparent' })); // now free
  const r = g.syncMapping(m, false);
  assert.equal(r.deleted, 1);
  assert.equal(env.cal.live(DST).length, 0);
});

test('non-qualifying new event with no copy: nothing created or deleted', () => {
  const { env, g, m } = setup({ busyOnly: true });
  env.cal.seed(SRC, timedEvent({ id: 'e1', transparency: 'transparent' }));
  const r = g.syncMapping(m, false);
  assert.equal(r.created, 0);
  assert.equal(r.deleted, 0);
  assert.equal(env.cal.live(DST).length, 0);
});

test('acceptedOnly: unaccepted invitation is skipped, then mirrored once accepted, then cleaned up', () => {
  const { env, g, m } = setup({ acceptedOnly: true });
  const me = (status) => [{ email: 'me@x.com', self: true, responseStatus: status }];

  // Invited but not yet accepted -> not copied.
  env.cal.seed(SRC, timedEvent({ id: 'e1', attendees: me('needsAction') }));
  let r = g.syncMapping(m, false);
  assert.equal(r.created, 0);
  assert.equal(env.cal.live(DST).length, 0);

  // Accept it -> copied.
  env.cal.seed(SRC, timedEvent({ id: 'e1', attendees: me('accepted') }));
  r = g.syncMapping(m, false);
  assert.equal(r.created, 1);
  assert.equal(env.cal.live(DST).length, 1);

  // Later decline it -> existing copy removed (stale cleanup).
  env.cal.seed(SRC, timedEvent({ id: 'e1', attendees: me('declined') }));
  r = g.syncMapping(m, false);
  assert.equal(r.deleted, 1);
  assert.equal(env.cal.live(DST).length, 0);
});

test('echo guard: a source event carrying our stamp is skipped', () => {
  const { env, g, m } = setup();
  env.cal.seed(SRC, timedEvent({ id: 'e1', extendedProperties: { private: { csSourceEventId: 'origin' } } }));
  const r = g.syncMapping(m, false);
  assert.equal(r.created, 0);
  assert.equal(env.cal.live(DST).length, 0);
});

test('dryRun computes counts but writes nothing and persists no token', () => {
  const { env, g, m } = setup();
  env.cal.seed(SRC, timedEvent({ id: 'e1' }));
  const r = g.syncMapping(m, true);
  assert.equal(r.created, 1);
  assert.equal(env.cal.live(DST).length, 0);
  assert.equal(g.getSyncToken(m.id), null);
});

test('idempotency: second run with no changes does nothing', () => {
  const { env, g, m } = setup();
  env.cal.seed(SRC, timedEvent({ id: 'e1' }));
  g.syncMapping(m, false);
  const r = g.syncMapping(m, false);
  assert.deepEqual([r.created, r.updated, r.deleted], [0, 0, 0]);
  assert.equal(env.cal.live(DST).length, 1);
});

test('410 expiry triggers a clean full re-sync without duplicates', () => {
  const { env, g, m } = setup();
  env.cal.seed(SRC, timedEvent({ id: 'e1', summary: 'A' }));
  g.syncMapping(m, false);                 // full sync, stores token
  env.cal.seed(SRC, timedEvent({ id: 'e2', summary: 'B' }));
  env.cal.expireToken(SRC);                // next incremental list throws 410 once
  const r = g.syncMapping(m, false);
  assert.equal(env.cal.live(DST).length, 2); // e1 matched+updated, e2 created — no dupes
  assert.ok(r.created + r.updated >= 2);
  assert.ok(g.getSyncToken(m.id));           // fresh token stored
});

test('per-event error is isolated; other events still process', () => {
  const { env, g, m } = setup();
  env.cal.seed(SRC, timedEvent({ id: 'e1', summary: 'Good' }));
  env.cal.seed(SRC, timedEvent({ id: 'e2', summary: 'Bad' }));
  // Make insert throw only for the second event by id.
  const realInsert = env.globals.Calendar.Events.insert;
  env.globals.Calendar.Events.insert = function (resource, calId, opts) {
    if (resource.extendedProperties.private.csSourceEventId === 'e2') throw new Error('boom');
    return realInsert(resource, calId, opts);
  };
  const r = g.syncMapping(m, false);
  assert.equal(r.errors, 1);
  assert.equal(r.created, 1); // the good one
});

test('two mappings to the same destination keep separate copies (scoped by csMapping)', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  const m1 = mapping({ id: 'm1', sourceCalId: SRC, destCalId: DST, titlePrefix: '[1] ' });
  const m2 = mapping({ id: 'm2', sourceCalId: SRC, destCalId: DST, titlePrefix: '[2] ' });
  env.cal.seed(SRC, timedEvent({ id: 'e1', summary: 'X' }));
  g.syncMapping(m1, false);
  g.syncMapping(m2, false);
  const copies = env.cal.live(DST);
  assert.equal(copies.length, 2);
  const titles = copies.map(function (c) { return c.summary; }).sort();
  assert.deepEqual(titles, ['[1] X', '[2] X']);

  // Editing via m1 only updates m1's copy.
  env.cal.seed(SRC, timedEvent({ id: 'e1', summary: 'Y' }));
  g.syncMapping(m1, false);
  const after = env.cal.live(DST).map(function (c) { return c.summary; }).sort();
  assert.deepEqual(after, ['[1] Y', '[2] X']);
});

test('syncAll runs enabled mappings and isolates a failing one', () => {
  const HEADERS = ['id', 'enabled', 'sourceCalId', 'destCalId', 'direction', 'copyMode', 'titlePrefix', 'filter', 'busyOnly', 'excludeCreators', 'overrideTitle'];
  const env = makeEnv({ sheets: [sheetWith('Mappings', [
    HEADERS,
    ['good', true, 'goodSrc', 'goodDst', 'source_to_dest', 'full', '', '', false, '', ''],
    ['bad', true, 'badSrc', 'badDst', 'source_to_dest', 'full', '', '', false, '', ''],
    ['off', false, 'offSrc', 'offDst', 'source_to_dest', 'full', '', '', false, '', ''],
  ])] });
  const g = loadGas(env.globals);
  env.cal.seed('goodSrc', timedEvent({ id: 'e1' }));
  env.cal.seed('offSrc', timedEvent({ id: 'e2' }));
  env.cal.failList('badSrc'); // listing badSrc throws

  g.syncAll();

  assert.equal(env.cal.live('goodDst').length, 1); // good mapping ran
  assert.equal(env.cal.live('offDst').length, 0);  // disabled mapping skipped
  // State tab recorded a row for both good and bad (bad with an error).
  const state = env.ss.ss.getSheetByName('State');
  assert.ok(state, 'State tab created');
  const ids = state.data.slice(1).map(function (row) { return row[0]; });
  assert.ok(ids.includes('good') && ids.includes('bad'));
});
