const test = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./harness/load');
const { makeEnv, sheetWith } = require('./harness/fakes');

const HEADERS = ['id', 'enabled', 'sourceCalId', 'destCalId', 'direction', 'copyMode', 'titlePrefix', 'filter', 'busyOnly', 'excludeCreators', 'overrideTitle'];

function gasWithMappings(rows) {
  const env = makeEnv({ sheets: [sheetWith('Mappings', [HEADERS].concat(rows))] });
  return loadGas(env.globals);
}

test('header-only sheet yields no mappings', () => {
  const g = gasWithMappings([]);
  assert.deepEqual(g.getMappings(), []);
});

test('rows missing id/source/dest are dropped', () => {
  const g = gasWithMappings([
    ['', true, 'src@cal', 'dst@cal', 'source_to_dest', 'full', '', '', false, '', ''],
    ['ok', true, 'src@cal', 'dst@cal', 'source_to_dest', 'full', '', '', false, '', ''],
    ['noSrc', true, '', 'dst@cal', 'source_to_dest', 'full', '', '', false, '', ''],
  ]);
  const ms = g.getMappings();
  assert.equal(ms.length, 1);
  assert.equal(ms[0].id, 'ok');
});

test('enabled and busyOnly accept boolean true and the string "TRUE"', () => {
  const g = gasWithMappings([
    ['a', true, 'src@cal', 'dst@cal', 'source_to_dest', 'full', '', '', 'TRUE', '', ''],
    ['b', 'FALSE', 'src@cal', 'dst@cal', 'source_to_dest', 'full', '', '', false, '', ''],
  ]);
  const ms = g.getMappings();
  assert.equal(ms[0].enabled, true);
  assert.equal(ms[0].busyOnly, true);
  assert.equal(ms[1].enabled, false);
  assert.equal(ms[1].busyOnly, false);
});

test('excludeCreators splits, trims, and lowercases', () => {
  const g = gasWithMappings([
    ['a', true, 'src@cal', 'dst@cal', 'source_to_dest', 'full', '', '', false, 'A@x.com,  B@Y.com ', ''],
  ]);
  assert.deepEqual(g.getMappings()[0].excludeCreators, ['a@x.com', 'b@y.com']);
});

test('defaults: blank copyMode -> full, blank direction -> source_to_dest', () => {
  const g = gasWithMappings([
    ['a', true, 'src@cal', 'dst@cal', '', '', '', '', false, '', ''],
  ]);
  const m = g.getMappings()[0];
  assert.equal(m.copyMode, 'full');
  assert.equal(m.direction, 'source_to_dest');
});

test('column order does not matter (header-keyed)', () => {
  // Reorder: put excludeCreators and overrideTitle before the rest.
  const reordered = ['overrideTitle', 'id', 'sourceCalId', 'destCalId', 'enabled', 'busyOnly', 'excludeCreators', 'direction', 'copyMode', 'titlePrefix', 'filter'];
  const env = makeEnv({ sheets: [sheetWith('Mappings', [
    reordered,
    ['MyTitle', 'a', 'src@cal', 'dst@cal', true, false, 'x@y.com', 'source_to_dest', 'full', '[P] ', 'team'],
  ])] });
  const g = loadGas(env.globals);
  const m = g.getMappings()[0];
  assert.equal(m.id, 'a');
  assert.equal(m.overrideTitle, 'MyTitle');
  assert.equal(m.titlePrefix, '[P] ');
  assert.deepEqual(m.excludeCreators, ['x@y.com']);
  assert.equal(m.filter, 'team');
});
