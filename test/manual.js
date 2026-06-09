/**
 * manual.js — functions to run by hand from the Apps Script editor for
 * debugging. None of these are wired to triggers or the menu.
 */

/**
 * Preview what a single mapping would do WITHOUT writing anything and WITHOUT
 * consuming/persisting its sync token. Pick a mapping id from the Mappings tab.
 * Results print to the execution log (View > Logs).
 *
 * @param {string} mappingId
 */
function dryRunMapping(mappingId) {
  var mapping = findMapping_(mappingId);
  if (!mapping) {
    console.log('No mapping with id "' + mappingId + '". Available: ' +
      getMappings().map(function (m) { return m.id; }).join(', '));
    return;
  }
  var result = syncMapping(mapping, true /* dryRun */);
  console.log('DRY RUN [' + mappingId + '] would: create=' + result.created +
    ' update=' + result.updated + ' delete=' + result.deleted +
    ' errors=' + result.errors + (result.note ? ' note=' + result.note : ''));
}

/** Dry-run every enabled mapping. */
function dryRunAll() {
  getMappings().forEach(function (m) {
    if (m.enabled) dryRunMapping(m.id);
  });
}

/** List the calendars the authorized account can see, with ids (for filling Mappings). */
function listMyCalendars() {
  var cals = Calendar.CalendarList.list({ maxResults: 250 }).items || [];
  cals.forEach(function (c) {
    console.log(c.accessRole + '\t' + c.id + '\t' + c.summary);
  });
}

function findMapping_(mappingId) {
  var matches = getMappings().filter(function (m) { return m.id === mappingId; });
  return matches.length ? matches[0] : null;
}
