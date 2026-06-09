/**
 * Triggers.js — manage the time-driven trigger that runs syncAll().
 */

var SYNC_HANDLER = 'syncAll';

/** Install (or reinstall) the recurring sync trigger. Idempotent. */
function installTrigger() {
  removeTrigger();
  ScriptApp.newTrigger(SYNC_HANDLER)
    .timeBased()
    .everyMinutes(TRIGGER_EVERY_MINUTES)
    .create();
  logInfo('', 'Installed trigger: ' + SYNC_HANDLER + ' every ' + TRIGGER_EVERY_MINUTES + ' min.');
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
