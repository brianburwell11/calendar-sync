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
  CALENDAR_IDS: 'CalendarIds',
};

/**
 * Expected headers on the Mappings tab. `Source`/`Destination` are
 * human-friendly calendar-name pickers; `sourceCalId`/`destCalId` are normally
 * VLOOKUP formulas that resolve those names against the `CalendarIds` tab. The
 * engine reads the resolved ids, so it doesn't care whether they were typed or
 * looked up. Order is not significant — getMappings() keys by header name.
 */
var MAPPING_HEADERS = [
  'id', 'enabled',
  'Source', 'sourceCalId',
  'Destination', 'destCalId',
  'direction', 'copyMode', 'titlePrefix', 'overrideTitle', 'filter',
  'busyOnly', 'excludeCreators', 'color',
];

/** Headers on the CalendarIds lookup tab (name → id). */
var CALENDAR_IDS_HEADERS = ['name', 'calendarId'];

var DIRECTION = {
  SOURCE_TO_DEST: 'source_to_dest', // implemented (mirror in)
  DEST_TO_SOURCE: 'dest_to_source', // Phase 2 (write-back) — not yet implemented
};

var COPY_MODE = {
  FULL: 'full',     // copy title/description/location/time, but never attendees
  BUSY: 'busy',     // opaque block titled "Busy", no details
  INVITE: 'invite', // no copy: add the Destination calendar as an attendee on the source event
};

/**
 * Google Calendar event colors: friendly name -> Calendar API `colorId`. These
 * are the eleven colors the API's Colors.event endpoint defines, so the
 * Mappings tab can pick a copy's color by name. The numeric ids "1"–"11" are
 * also accepted directly. A blank/unknown value leaves colorId unset, so the
 * copy takes the destination calendar's default event color.
 */
var EVENT_COLORS = {
  lavender: '1',
  sage: '2',
  grape: '3',
  flamingo: '4',
  banana: '5',
  tangerine: '6',
  peacock: '7',
  graphite: '8',
  blueberry: '9',
  basil: '10',
  tomato: '11',
};

/** The color names in id order, for the Mappings `color` dropdown. */
var EVENT_COLOR_NAMES = [
  'Lavender', 'Sage', 'Grape', 'Flamingo', 'Banana', 'Tangerine',
  'Peacock', 'Graphite', 'Blueberry', 'Basil', 'Tomato',
];

/**
 * Resolve a user-entered color (a name like "Tomato" or a numeric id "1"–"11")
 * to a Calendar API colorId string. Empty or unrecognized values return '',
 * meaning "leave the color unset" (use the calendar's default event color).
 * @return {string}
 */
function colorIdFor_(value) {
  var v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  if (EVENT_COLORS[v]) return EVENT_COLORS[v];   // by name
  if (/^([1-9]|1[01])$/.test(v)) return v;        // by numeric id 1–11
  return '';                                       // unknown -> default color
}

/** Full-sync window relative to "now" when there is no sync token yet. */
var SYNC_WINDOW = {
  PAST_DAYS: 7,
  FUTURE_DAYS: 365,
};

/** Default trigger cadence, in minutes. */
var TRIGGER_EVERY_MINUTES = 5;

/**
 * Apply the shared workbook look to a freshly-populated tab: Montserrat font
 * throughout, a bold header row, and light-grey alternating row colors (header
 * #BDBDBD, stripes #FFFFFF / #F3F3F3 — Google's LIGHT_GREY banding theme).
 * Safe to re-run: existing banding is cleared first.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} numCols how many columns the tab uses.
 */
function styleTab_(sheet, numCols) {
  var all = sheet.getRange(1, 1, sheet.getMaxRows(), numCols);
  all.setFontFamily('Montserrat');

  all.getBandings().forEach(function (b) { b.remove(); });
  all.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);

  sheet.getRange(1, 1, 1, numCols).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

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
      // When set, replaces every mirrored event's title (the source title is ignored).
      m.overrideTitle = String(m.overrideTitle || '');
      m.filter = String(m.filter || '').trim();
      // Optional event color for copies (full/busy); resolved to a Calendar
      // colorId at build time. Blank/unknown -> the calendar's default color.
      m.color = String(m.color || '').trim();
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

/**
 * (Re)build the CalendarIds tab — one row per calendar the authorized account
 * can see, as `name` then `calendarId` — so the Mappings tab can pick calendars
 * by name (via VLOOKUP) instead of pasting raw ids. A `primary` alias row is
 * always written first so mappings can target the main calendar by that keyword.
 * The whole tab is rewritten so renamed/removed calendars don't linger.
 *
 * @return {number} how many calendars were listed (excludes the primary alias).
 */
function refreshCalendarIds() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.CALENDAR_IDS) || ss.insertSheet(SHEET.CALENDAR_IDS);

  var items = (Calendar.CalendarList.list({ maxResults: 250 }).items) || [];
  items.sort(function (a, b) {
    return String(a.summary || a.id).toLowerCase()
      .localeCompare(String(b.summary || b.id).toLowerCase());
  });

  var rows = [CALENDAR_IDS_HEADERS, ['primary', 'primary']];
  items.forEach(function (c) {
    if (c.primary) return; // already represented by the 'primary' alias
    rows.push([c.summary || c.id, c.id]);
  });

  sheet.clear();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  styleTab_(sheet, 2);
  sheet.autoResizeColumns(1, 2);
  return rows.length - 2; // exclude the header and the 'primary' alias row
}
