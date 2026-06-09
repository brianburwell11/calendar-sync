/**
 * State.js — per-mapping sync state.
 *
 * The authoritative store is ScriptProperties (fast, survives across runs).
 * A human-readable mirror is written to the "State" tab so you can see token
 * presence, last run, and errors without opening the script editor.
 */

/** @return {GoogleAppsScript.Properties.Properties} */
function props_() {
  return PropertiesService.getScriptProperties();
}

function stateKey_(mappingId, field) {
  return 'state.' + mappingId + '.' + field;
}

/** @return {string|null} stored sync token for a mapping, or null. */
function getSyncToken(mappingId) {
  return props_().getProperty(stateKey_(mappingId, 'syncToken')) || null;
}

function setSyncToken(mappingId, token) {
  if (token) {
    props_().setProperty(stateKey_(mappingId, 'syncToken'), token);
  } else {
    props_().deleteProperty(stateKey_(mappingId, 'syncToken'));
  }
}

/** Drop the sync token so the next run performs a full re-sync. */
function resetSyncToken(mappingId) {
  setSyncToken(mappingId, null);
}

/**
 * Record the outcome of a run for a mapping and mirror it to the State tab.
 * @param {string} mappingId
 * @param {{created:number, updated:number, deleted:number, errors:number, note:string}} result
 */
function recordRun(mappingId, result) {
  var p = props_();
  var nowIso = new Date().toISOString();
  p.setProperty(stateKey_(mappingId, 'lastRunISO'), nowIso);
  p.setProperty(stateKey_(mappingId, 'lastResult'), JSON.stringify(result));

  writeStateRow_(mappingId, nowIso, result);
}

/** Upsert one row per mapping into the State tab. */
function writeStateRow_(mappingId, nowIso, result) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.STATE) || ss.insertSheet(SHEET.STATE);
  var headers = ['mappingId', 'hasSyncToken', 'lastRun', 'created', 'updated', 'deleted', 'errors', 'note'];

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  var rowValues = [
    mappingId,
    !!getSyncToken(mappingId),
    nowIso,
    result.created || 0,
    result.updated || 0,
    result.deleted || 0,
    result.errors || 0,
    result.note || '',
  ];

  // Find an existing row for this mappingId in column A.
  var lastRow = sheet.getLastRow();
  var ids = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
  var target = -1;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === mappingId) { target = i + 2; break; }
  }
  if (target === -1) target = lastRow + 1;

  sheet.getRange(target, 1, 1, rowValues.length).setValues([rowValues]);
}
