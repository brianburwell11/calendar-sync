/**
 * Config.js — constants and reading the Mappings tab from the bound Sheet.
 *
 * Apps Script concatenates all files into one global scope, so everything here
 * is globally visible to the other modules (no import/require).
 */

/** Private extended-property keys stamped on every mirrored (copy) event. */
var CS_PROP = {
  SOURCE: 'csSource',          // source calendar id the copy came from
  SOURCE_EVENT: 'csSourceEventId', // source event id
  MAPPING: 'csMapping',        // mapping id that produced the copy
};

/** Sheet tab names. */
var SHEET = {
  MAPPINGS: 'Mappings',
  STATE: 'State',
  LOG: 'Log',
};

/** Expected header order on the Mappings tab. */
var MAPPING_HEADERS = [
  'id', 'enabled', 'sourceCalId', 'destCalId',
  'direction', 'copyMode', 'titlePrefix', 'filter',
  'busyOnly', 'excludeCreators',
];

var DIRECTION = {
  SOURCE_TO_DEST: 'source_to_dest', // implemented (mirror in)
  DEST_TO_SOURCE: 'dest_to_source', // Phase 2 (write-back) — not yet implemented
};

var COPY_MODE = {
  FULL: 'full',   // copy title/description/location/time, but never attendees
  BUSY: 'busy',   // opaque block titled "Busy", no details
};

/** Full-sync window relative to "now" when there is no sync token yet. */
var SYNC_WINDOW = {
  PAST_DAYS: 7,
  FUTURE_DAYS: 365,
};

/** Default trigger cadence, in minutes. */
var TRIGGER_EVERY_MINUTES = 5;

/** @return {GoogleAppsScript.Spreadsheet.Spreadsheet} the bound spreadsheet. */
function getSpreadsheet_() {
  var ss = SpreadsheetApp.getActive();
  if (!ss) {
    throw new Error('No bound spreadsheet. This script must be container-bound to a Sheet.');
  }
  return ss;
}

/**
 * Read the Mappings tab into an array of mapping objects (one per data row).
 * Rows missing an id or source/dest calendar are skipped.
 * @return {Array<Object>}
 */
function getMappings() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.MAPPINGS);
  if (!sheet) {
    throw new Error('Missing "' + SHEET.MAPPINGS + '" tab. Run Setup from the menu first.');
  }
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = values.slice(1);

  return rows
    .map(function (row, i) {
      var m = {};
      headers.forEach(function (h, c) { m[h] = row[c]; });
      m.id = String(m.id || '').trim();
      m.sourceCalId = String(m.sourceCalId || '').trim();
      m.destCalId = String(m.destCalId || '').trim();
      m.direction = String(m.direction || DIRECTION.SOURCE_TO_DEST).trim();
      m.copyMode = String(m.copyMode || COPY_MODE.FULL).trim().toLowerCase();
      m.titlePrefix = String(m.titlePrefix || '');
      m.filter = String(m.filter || '').trim();
      m.enabled = (m.enabled === true || String(m.enabled).trim().toUpperCase() === 'TRUE');
      m.busyOnly = (m.busyOnly === true || String(m.busyOnly).trim().toUpperCase() === 'TRUE');
      // Comma-separated list of emails to exclude, normalized to lowercase.
      m.excludeCreators = String(m.excludeCreators || '')
        .split(',')
        .map(function (e) { return e.trim().toLowerCase(); })
        .filter(function (e) { return e; });
      m._row = i + 2; // 1-based sheet row, for diagnostics
      return m;
    })
    .filter(function (m) { return m.id && m.sourceCalId && m.destCalId; });
}
