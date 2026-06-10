/**
 * Log.js — append-only run log written to the "Log" tab.
 */

/**
 * Append a log row. Newest rows are appended at the bottom.
 * @param {string} level  'INFO' | 'WARN' | 'ERROR'
 * @param {string} mappingId
 * @param {string} message
 */
function logRow(level, mappingId, message) {
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(SHEET.LOG) || ss.insertSheet(SHEET.LOG);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, 4)
        .setValues([['timestamp', 'level', 'mappingId', 'message']])
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    // A real Date (not an ISO string) so Sheets stores a native datetime value
    // — sortable, filterable, and shown in the spreadsheet's timezone/locale.
    sheet.appendRow([new Date(), level, mappingId || '', message || '']);
  } catch (e) {
    // Logging must never break a sync run.
    console.error('logRow failed: ' + e);
  }
}

function logInfo(mappingId, message) { logRow('INFO', mappingId, message); }
function logWarn(mappingId, message) { logRow('WARN', mappingId, message); }
function logError(mappingId, message) { logRow('ERROR', mappingId, message); }
