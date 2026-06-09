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
    .addItem('Install schedule', 'menuInstallSchedule')
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
    TRIGGER_EVERY_MINUTES + ' minutes.');
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

/**
 * Create the Mappings/State/Log tabs with headers if missing, and seed one
 * disabled example mapping row so the columns are self-documenting.
 */
function menuSetup() {
  var ss = getSpreadsheet_();

  var mappings = ss.getSheetByName(SHEET.MAPPINGS) || ss.insertSheet(SHEET.MAPPINGS);
  if (mappings.getLastRow() === 0) {
    mappings.getRange(1, 1, 1, MAPPING_HEADERS.length)
      .setValues([MAPPING_HEADERS]).setFontWeight('bold');
    mappings.setFrozenRows(1);
    mappings.appendRow([
      'org-a', false, 'orga@group.calendar.google.com', 'primary',
      DIRECTION.SOURCE_TO_DEST, COPY_MODE.FULL, '[Org A] ', '',
    ]);
    mappings.autoResizeColumns(1, MAPPING_HEADERS.length);
  }

  // Ensure State and Log tabs exist (headers are written lazily on first use).
  if (!ss.getSheetByName(SHEET.STATE)) ss.insertSheet(SHEET.STATE);
  if (!ss.getSheetByName(SHEET.LOG)) ss.insertSheet(SHEET.LOG);

  SpreadsheetApp.getUi().alert(
    'Setup complete.\n\n' +
    '1. Fill the Mappings tab (set destCalId to "primary" for your main calendar).\n' +
    '2. Set enabled = TRUE on the rows you want.\n' +
    '3. Click "Run now" to do the first sync, then "Install schedule".');
}
