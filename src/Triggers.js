/**
 * Triggers.js — manage the time-driven trigger that runs syncAll().
 */

var SYNC_HANDLER = 'syncAll';

/** ScriptProperties key holding the user-chosen cadence, in minutes. */
var TRIGGER_MINUTES_KEY = 'config.triggerMinutes';

/**
 * Intervals Apps Script's trigger builder accepts, in minutes. everyMinutes()
 * only allows 1/5/10/15/30; larger cadences must go through everyHours().
 */
var VALID_TRIGGER_MINUTES = [1, 5, 10, 15, 30, 60, 120, 240, 360, 480, 720];

/** @return {number} the configured cadence in minutes (default TRIGGER_EVERY_MINUTES). */
function getTriggerMinutes() {
  var raw = props_().getProperty(TRIGGER_MINUTES_KEY);
  var n = parseInt(raw, 10);
  return VALID_TRIGGER_MINUTES.indexOf(n) !== -1 ? n : TRIGGER_EVERY_MINUTES;
}

/**
 * Persist the cadence and reinstall the trigger if one is currently active.
 * @param {number} minutes one of VALID_TRIGGER_MINUTES.
 * @throws if minutes is not a supported interval.
 */
function setTriggerMinutes(minutes) {
  if (VALID_TRIGGER_MINUTES.indexOf(minutes) === -1) {
    throw new Error('Unsupported interval: ' + minutes + ' min. Allowed: ' +
      VALID_TRIGGER_MINUTES.join(', ') + '.');
  }
  props_().setProperty(TRIGGER_MINUTES_KEY, String(minutes));
  if (hasTrigger()) installTrigger();
}

/** Install (or reinstall) the recurring sync trigger. Idempotent. */
function installTrigger() {
  removeTrigger();
  var minutes = getTriggerMinutes();
  var builder = ScriptApp.newTrigger(SYNC_HANDLER).timeBased();
  if (minutes % 60 === 0) {
    builder.everyHours(minutes / 60);
  } else {
    builder.everyMinutes(minutes);
  }
  builder.create();
  logInfo('', 'Installed trigger: ' + SYNC_HANDLER + ' every ' + minutes + ' min.');
}

/** Remove all triggers bound to syncAll(). */
function removeTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === SYNC_HANDLER) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  if (removed) logInfo('', 'Removed ' + removed + ' trigger(s).');
}

/** @return {boolean} whether the sync trigger is currently installed. */
function hasTrigger() {
  return ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === SYNC_HANDLER;
  });
}
