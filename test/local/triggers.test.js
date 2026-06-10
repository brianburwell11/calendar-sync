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

test('getTriggerMinutes returns the default until a value is persisted', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  assert.equal(g.getTriggerMinutes(), g.TRIGGER_EVERY_MINUTES);
  g.setTriggerMinutes(15);
  assert.equal(g.getTriggerMinutes(), 15);
});

test('setTriggerMinutes rejects unsupported intervals', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  assert.throws(() => g.setTriggerMinutes(7), /Unsupported interval/);
  assert.equal(g.getTriggerMinutes(), g.TRIGGER_EVERY_MINUTES);
});

test('installTrigger uses the configured cadence', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.setTriggerMinutes(30);
  g.installTrigger();
  assert.equal(env.script.triggers()[0].everyMinutes, 30);
});

test('hour-scale intervals go through everyHours()', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.setTriggerMinutes(120);
  g.installTrigger();
  assert.equal(env.script.triggers()[0].everyMinutes, 120);
});

test('setTriggerMinutes reinstalls an active trigger at the new cadence', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.installTrigger();
  g.setTriggerMinutes(10);
  assert.equal(env.script.triggers().length, 1);
  assert.equal(env.script.triggers()[0].everyMinutes, 10);
});

test('setTriggerMinutes does not install a trigger when none is active', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.setTriggerMinutes(10);
  assert.equal(env.script.triggers().length, 0);
});
