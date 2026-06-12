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

/**
 * Diagnose filtering for a mapping. Lists upcoming source events and prints,
 * for each, the creator/organizer emails, busy status, and whether it would be
 * mirrored or skipped (and why). Use this to find the exact email string to put
 * in the excludeCreators column. Reads only — writes nothing, touches no token.
 *
 * @param {string} mappingId
 */
function inspectMapping(mappingId) {
  var mapping = findMapping_(mappingId);
  if (!mapping) {
    console.log('No mapping with id "' + mappingId + '".');
    return;
  }
  console.log('Mapping "' + mapping.id + '" parsed filters:');
  console.log('  filter="' + mapping.filter + '"  busyOnly=' + mapping.busyOnly +
    '  acceptedOnly=' + mapping.acceptedOnly +
    '  excludeCreators=' + JSON.stringify(mapping.excludeCreators));
  if (!mapping.excludeCreators.length) {
    console.log('  NOTE: excludeCreators is empty. Check that the Mappings tab has a ' +
      'header spelled exactly "excludeCreators" with comma-separated emails.');
  }

  var now = new Date();
  var resp = Calendar.Events.list(mapping.sourceCalId, {
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + 30 * 86400000).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    showDeleted: false,
    maxResults: 50,
  });
  var items = resp.items || [];
  console.log('--- ' + items.length + ' upcoming event(s) ---');
  items.forEach(function (src) {
    var creator = (src.creator && src.creator.email) || '(none)';
    var organizer = (src.organizer && src.organizer.email) || '(none)';
    var reasons = [];
    if (isOwnMirror(src)) reasons.push('ownMirror');
    if (!passesTitleFilter_(src, mapping)) reasons.push('title');
    if (mapping.busyOnly && !isBusy_(src)) reasons.push('free');
    if (creatorExcluded_(src, mapping)) reasons.push('excludedCreator');
    if (!passesAcceptedGate_(src, mapping)) reasons.push('notAccepted');
    var verdict = reasons.length ? 'SKIP' : 'MIRROR';
    console.log(verdict + ' | "' + (src.summary || '(no title)') + '"' +
      ' | creator=' + creator + ' organizer=' + organizer +
      ' | transp=' + (src.transparency || 'opaque') +
      (reasons.length ? ' | skip=' + reasons.join(',') : ''));
  });
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
