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
    // sourceCalId (col D) / destCalId (col F) look the chosen names up in
    // CalendarIds. Editing the Source/Destination names refills the ids.
    mappings.appendRow([
      'org-a', false,
      'primary', lookupIdFormula_('C'),
      'primary', lookupIdFormula_('E'),
      DIRECTION.SOURCE_TO_DEST, COPY_MODE.FULL, '[Org A] ', '',
      '', false, '',
    ]);
    styleTab_(mappings, MAPPING_HEADERS.length);
    applyCalendarNameValidation_(mappings, calSheet);
    applyDisabledRowFormat_(mappings);
    mappings.autoResizeColumns(1, MAPPING_HEADERS.length);
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
 * VLOOKUP that resolves a calendar name in the given Mappings column (a letter
 * like "C") to its id from the CalendarIds tab. Row 2 is relative so it fills
 * down. Returns "" when the name isn't found, which the engine treats as "skip".
 */
function lookupIdFormula_(nameColLetter) {
  return '=IFERROR(VLOOKUP($' + nameColLetter + '2,' + SHEET.CALENDAR_IDS +
    '!$A:$B,2,FALSE),"")';
}

/**
 * Attach a dropdown of calendar names (from CalendarIds) to the Source and
 * Destination columns of the Mappings tab. Invalid values are allowed so power
 * users can still type a raw id or the "primary" keyword.
 */
function applyCalendarNameValidation_(mappingsSheet, calSheet) {
  var names = calSheet.getRange(2, 1, Math.max(calSheet.getLastRow() - 1, 1), 1);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(names, true)
    .setAllowInvalid(true)
    .build();
  mappingsSheet.getRange(2, 3, 1000, 1).setDataValidation(rule); // Source
  mappingsSheet.getRange(2, 5, 1000, 1).setDataValidation(rule); // Destination
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
