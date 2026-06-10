const test = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./harness/load');
const { makeEnv } = require('./harness/fakes');

test('installTrigger creates exactly one syncAll trigger at the configured cadence', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.installTrigger();
  const ts = env.script.triggers();
  assert.equal(ts.length, 1);
  assert.equal(ts[0].getHandlerFunction(), 'syncAll');
  assert.equal(ts[0].everyMinutes, g.TRIGGER_EVERY_MINUTES);
});

test('installTrigger is idempotent (removes existing before creating)', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.installTrigger();
  g.installTrigger();
  assert.equal(env.script.triggers().length, 1);
});

test('removeTrigger deletes the syncAll trigger; hasTrigger reflects state', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  assert.equal(g.hasTrigger(), false);
  g.installTrigger();
  assert.equal(g.hasTrigger(), true);
  g.removeTrigger();
  assert.equal(g.hasTrigger(), false);
  assert.equal(env.script.triggers().length, 0);
});
