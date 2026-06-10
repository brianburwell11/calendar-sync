const test = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./harness/load');
const { makeEnv } = require('./harness/fakes');

test('menuSetup creates the Mappings tab with the canonical headers', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.menuSetup();
  const sheet = env.ss.ss.getSheetByName('Mappings');
  assert.ok(sheet, 'Mappings tab created');
  assert.deepEqual(sheet.data[0], g.MAPPING_HEADERS);
});

test('seeded sample row width matches MAPPING_HEADERS (column-drift guard)', () => {
  // This is the regression test that catches forgetting to extend the sample
  // row whenever a new Mappings column is added.
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.menuSetup();
  const sheet = env.ss.ss.getSheetByName('Mappings');
  assert.equal(sheet.data[1].length, g.MAPPING_HEADERS.length);
});

test('menuSetup also creates State and Log tabs', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.menuSetup();
  assert.ok(env.ss.ss.getSheetByName('State'));
  assert.ok(env.ss.ss.getSheetByName('Log'));
});
