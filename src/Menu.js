/**
 * Menu.js — the in-Sheet control surface.
 *
 * onOpen() builds a "Calendar Sync" menu. The menu functions are thin wrappers
 * that add user-facing toasts/alerts around the engine functions.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Calendar Sync')
    .addItem('Run now', 'menuRunNow')
    .addSeparator()
    .addItem('Setup (create tabs)', 'menuSetup')
    .addItem('Refresh calendar list', 'menuRefreshCalendars')
    .addItem('Install schedule', 'menuInstallSchedule')
    .addItem('Set schedule interval…', 'menuSetInterval')
    .addItem('Remove schedule', 'menuRemoveSchedule')
    .addSeparator()
    .addItem('Reset all sync tokens (full re-sync)', 'menuResetTokens')
    .addToUi();
}

function menuRunNow() {
  var ss = getSpreadsheet_();
  ss.toast('Syncing…', 'Calendar Sync', 5);
  syncAll();
  ss.toast('Done. See the Log and State tabs.', 'Calendar Sync', 5);
}

function menuInstallSchedule() {
  installTrigger();
  SpreadsheetApp.getUi().alert('Schedule installed: sync runs every ' +
    getTriggerMinutes() + ' minutes.');
}

/**
 * Prompt for and persist the schedule interval. If a schedule is already
 * installed it is reinstalled at the new cadence immediately.
 */
function menuSetInterval() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt('Set schedule interval',
    'Sync currently runs every ' + getTriggerMinutes() + ' minutes.\n\n' +
    'Enter a new interval in minutes. Allowed values:\n' +
    VALID_TRIGGER_MINUTES.join(', ') + '.',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  var minutes = parseInt(resp.getResponseText().trim(), 10);
  try {
    setTriggerMinutes(minutes);
  } catch (e) {
    ui.alert(e.message);
    return;
  }

  ui.alert(hasTrigger()
    ? 'Interval set to ' + minutes + ' minutes. The active schedule was updated.'
    : 'Interval set to ' + minutes + ' minutes. Click "Install schedule" to start it.');
}

function menuRemoveSchedule() {
  removeTrigger();
  SpreadsheetApp.getUi().alert('Schedule removed. Sync will only run when you click "Run now".');
}

function menuResetTokens() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert('Reset all sync tokens?',
    'The next run will do a full re-sync of every mapping. Existing copies are ' +
    'matched by their stamped properties, so this will not create duplicates.',
    ui.ButtonSet.OK_CANCEL);
  if (resp !== ui.Button.OK) return;

  getMappings().forEach(function (m) { resetSyncToken(m.id); });
  ui.alert('All sync tokens reset.');
}

/** Rebuild the CalendarIds tab from the account's visible calendars. */
function menuRefreshCalendars() {
  var n = refreshCalendarIds();
  SpreadsheetApp.getUi().alert('CalendarIds updated: ' + n + ' calendar(s) listed.\n\n' +
    'In the Mappings tab, pick calendars by name in the Source and Destination ' +
    'columns — their ids fill in automatically.');
}

/**
 * Create the CalendarIds/Mappings/State/Log tabs if missing, populate the
 * calendar list, and seed one disabled example mapping row that resolves its
 * ids by name via VLOOKUP so the columns are self-documenting.
 */
function menuSetup() {
  var ss = getSpreadsheet_();

  // CalendarIds first so the Mappings name pickers can reference it. Calendar
  // access may not be granted yet on the very first run; fall back to a header.
  try {
    refreshCalendarIds();
  } catch (e) {
    // ignore — "Refresh calendar list" can fill it once access is granted.
  }
  var calSheet = ss.getSheetByName(SHEET.CALENDAR_IDS) || ss.insertSheet(SHEET.CALENDAR_IDS);
  if (calSheet.getLastRow() === 0) {
    calSheet.getRange(1, 1, 1, 2).setValues([CALENDAR_IDS_HEADERS]);
    calSheet.getRange(2, 1, 1, 2).setValues([['primary', 'primary']]);
    styleTab_(calSheet, 2);
  }

  var mappings = ss.getSheetByName(SHEET.MAPPINGS) || ss.insertSheet(SHEET.MAPPINGS);
  if (mappings.getLastRow() === 0) {
    mappings.getRange(1, 1, 1, MAPPING_HEADERS.length).setValues([MAPPING_HEADERS]);
    // sourceCalId / destCalId are left blank here; applyMappingsLayout_ fills the
    // whole column with the VLOOKUP that resolves the chosen Source/Destination.
    mappings.appendRow([
      'org-a', false,
      'primary', '',
      'primary', '',
      DIRECTION.SOURCE_TO_DEST, COPY_MODE.FULL, '[Org A] ', '',
      '', false, '', '', false,
    ]);
    styleTab_(mappings, MAPPING_HEADERS.length);
    applyMappingsLayout_(mappings, calSheet);
    applyDisabledRowFormat_(mappings);
  }

  // Ensure State and Log tabs exist (headers are written lazily on first use).
  if (!ss.getSheetByName(SHEET.STATE)) ss.insertSheet(SHEET.STATE);
  if (!ss.getSheetByName(SHEET.LOG)) ss.insertSheet(SHEET.LOG);

  SpreadsheetApp.getUi().alert(
    'Setup complete.\n\n' +
    '1. In Mappings, pick a Source and Destination by name (the id columns fill ' +
    'in automatically). Use "primary" for your main calendar.\n' +
    '2. Set enabled = TRUE on the rows you want.\n' +
    '3. Click "Run now" to do the first sync, then "Install schedule".\n\n' +
    'If a calendar is missing from the dropdowns, click "Refresh calendar list".');
}

/**
 * Per-column pixel widths for the Mappings tab (1-based column → px), matching
 * the reference workbook. Column 12 (busyOnly) is intentionally absent so it
 * keeps the default width.
 */
var MAPPING_COL_WIDTHS = {
  1: 102, 2: 57, 3: 183, 4: 134, 5: 134, 6: 116,
  7: 111, 8: 72, 9: 100, 10: 83, 11: 74, 13: 131, 14: 90,
};

/** Notes shown on the Mappings header cells (1-based column → text). */
var MAPPING_HEADER_NOTES = {
  1: 'unique identifier for this sync rule',
  2: 'whether or not to run this sync rule',
  6: 'primary = main calendar',
  7: 'source_to_dest',
  8: 'full (details, no attendees), busy (opaque "Busy" block), or invite (add the Destination calendar as an attendee on the source event — no copy)',
  9: 'optional prefix on copied titles',
  11: 'optional: only copy events whose title contain this text',
  14: 'optional: event color for copies (full/busy). A color name or 1-11. Blank = the destination calendar\'s default color. Ignored by invite mode.',
  15: 'TRUE = only copy events the source calendar has accepted (skip invitations that are needsAction, tentative, or declined). Events you organize or that have no guests always pass.',
};

/**
 * Lay out the Mappings tab like the reference workbook: column widths, hidden
 * VLOOKUP id columns, checkboxes on the boolean columns, dropdowns (calendar
 * names for Source/Destination, fixed lists for direction/copyMode), and the
 * header-cell notes.
 */
function applyMappingsLayout_(mappingsSheet, calSheet) {
  var LAST = 1000;

  // Fill the id columns with the VLOOKUP that resolves the name in the cell to
  // their left (Source for sourceCalId, Destination for destCalId) against
  // CalendarIds. One relative R1C1 formula per column fills every data row, so
  // any mapping you add later resolves automatically. Returns "" if not found.
  var lookup = function (nameCol) {
    return '=IFERROR(VLOOKUP(RC' + nameCol + ',' + SHEET.CALENDAR_IDS +
      '!C1:C2,2,FALSE),"")';
  };
  mappingsSheet.getRange(2, 4, LAST - 1, 1).setFormulaR1C1(lookup(3)); // sourceCalId ← Source
  mappingsSheet.getRange(2, 6, LAST - 1, 1).setFormulaR1C1(lookup(5)); // destCalId ← Destination

  // Column widths (column 12 keeps the default).
  Object.keys(MAPPING_COL_WIDTHS).forEach(function (col) {
    mappingsSheet.setColumnWidth(Number(col), MAPPING_COL_WIDTHS[col]);
  });

  // Hide the VLOOKUP id columns — only the friendly names are meant to show.
  mappingsSheet.hideColumns(4); // sourceCalId
  mappingsSheet.hideColumns(6); // destCalId

  // Checkboxes on the boolean columns.
  mappingsSheet.getRange(2, 2, LAST, 1).insertCheckboxes();  // enabled
  mappingsSheet.getRange(2, 12, LAST, 1).insertCheckboxes(); // busyOnly
  mappingsSheet.getRange(2, 15, LAST, 1).insertCheckboxes(); // acceptedOnly

  // Dropdowns (render as chips; invalid entries rejected). Source/Destination
  // pull names from CalendarIds; direction/copyMode are fixed lists.
  var nameRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(calSheet.getRange(1, 1, calSheet.getMaxRows(), 1), true)
    .setAllowInvalid(false)
    .build();
  mappingsSheet.getRange(2, 3, LAST, 1).setDataValidation(nameRule); // Source
  mappingsSheet.getRange(2, 5, LAST, 1).setDataValidation(nameRule); // Destination

  var directionRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([DIRECTION.SOURCE_TO_DEST], true)
    .setAllowInvalid(false)
    .build();
  mappingsSheet.getRange(2, 7, LAST, 1).setDataValidation(directionRule);

  var copyModeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([COPY_MODE.FULL, COPY_MODE.BUSY, COPY_MODE.INVITE], true)
    .setAllowInvalid(false)
    .build();
  mappingsSheet.getRange(2, 8, LAST, 1).setDataValidation(copyModeRule);

  // Color names as a dropdown; allow-invalid so a blank cell (= default color)
  // or a raw numeric id ("1"–"11") is still accepted.
  var colorRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(EVENT_COLOR_NAMES, true)
    .setAllowInvalid(true)
    .build();
  mappingsSheet.getRange(2, 14, LAST, 1).setDataValidation(colorRule); // color

  // Header-cell notes.
  Object.keys(MAPPING_HEADER_NOTES).forEach(function (col) {
    mappingsSheet.getRange(1, Number(col)).setNote(MAPPING_HEADER_NOTES[col]);
  });
}

/**
 * Grey out and strike through disabled mapping rows (enabled = FALSE) so they
 * read as "off" at a glance. Rows with no id (blank template rows) are left
 * alone. Uses the workbook's disabled-row color (#b7b7b7).
 */
function applyDisabledRowFormat_(mappingsSheet) {
  var range = mappingsSheet.getRange(2, 1, 1000, MAPPING_HEADERS.length);
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($A2<>"", $B2=FALSE)')
    .setStrikethrough(true)
    .setFontColor('#b7b7b7')
    .setRanges([range])
    .build();
  var rules = mappingsSheet.getConditionalFormatRules();
  rules.push(rule);
  mappingsSheet.setConditionalFormatRules(rules);
}
