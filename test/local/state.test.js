const test = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./harness/load');
const { makeEnv } = require('./harness/fakes');

test('sync token round-trips and resets', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  assert.equal(g.getSyncToken('m1'), null);
  g.setSyncToken('m1', 'tok:5');
  assert.equal(g.getSyncToken('m1'), 'tok:5');
  g.resetSyncToken('m1');
  assert.equal(g.getSyncToken('m1'), null);
});

test('recordRun upserts one State row per mapping (no duplicate rows)', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.recordRun('m1', { created: 1, updated: 0, deleted: 0, errors: 0, note: '' });
  g.recordRun('m1', { created: 0, updated: 2, deleted: 0, errors: 0, note: 'again' });

  const state = env.ss.ss.getSheetByName('State');
  const rows = state.data.slice(1); // drop header
  const m1rows = rows.filter(function (r) { return r[0] === 'm1'; });
  assert.equal(m1rows.length, 1);           // upsert, not append
  assert.equal(m1rows[0][4], 2);            // 'updated' column reflects latest run
  assert.equal(m1rows[0][7], 'again');      // 'note' column
});
