const test = require('node:test');
const assert = require('node:assert');
const { loadGas } = require('./harness/load');
const { makeEnv } = require('./harness/fakes');

test('menuSetup creates the Mappings tab with the canonical headers', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.menuSetup();
  const sheet = env.ss.ss.getSheetByName('Mappings');
  assert.ok(sheet, 'Mappings tab created');
  assert.deepEqual(sheet.data[0], g.MAPPING_HEADERS);
});

test('seeded sample row width matches MAPPING_HEADERS (column-drift guard)', () => {
  // This is the regression test that catches forgetting to extend the sample
  // row whenever a new Mappings column is added.
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.menuSetup();
  const sheet = env.ss.ss.getSheetByName('Mappings');
  assert.equal(sheet.data[1].length, g.MAPPING_HEADERS.length);
});

test('menuSetup also creates State and Log tabs', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.menuSetup();
  assert.ok(env.ss.ss.getSheetByName('State'));
  assert.ok(env.ss.ss.getSheetByName('Log'));
});

test('menuSetup creates a CalendarIds tab with a primary alias row', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.menuSetup();
  const sheet = env.ss.ss.getSheetByName('CalendarIds');
  assert.ok(sheet, 'CalendarIds tab created');
  assert.deepEqual(sheet.data[0], g.CALENDAR_IDS_HEADERS);
  assert.deepEqual(sheet.data[1], ['primary', 'primary']);
});

test('the id columns are filled with VLOOKUP formulas down the whole tab', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.menuSetup();
  const sheet = env.ss.ss.getSheetByName('Mappings');
  const headers = g.MAPPING_HEADERS;
  const srcCol = headers.indexOf('sourceCalId'); // 0-based
  const dstCol = headers.indexOf('destCalId');
  // Sample row (row 2) holds names; the id columns hold lookup formulas.
  assert.equal(sheet.data[1][headers.indexOf('Source')], 'primary');
  assert.match(sheet.data[1][srcCol], /^=IFERROR\(VLOOKUP\(RC3,CalendarIds!C1:C2/);
  assert.match(sheet.data[1][dstCol], /^=IFERROR\(VLOOKUP\(RC5,CalendarIds!C1:C2/);
  // The formula is filled far down the column, not just the sample row.
  assert.match(sheet.data[499][srcCol], /^=IFERROR\(VLOOKUP\(RC3,CalendarIds/); // row 500
  assert.match(sheet.data[999][dstCol], /^=IFERROR\(VLOOKUP\(RC5,CalendarIds/); // row 1000
});

test('menuSetup lays out the Mappings tab: hidden id columns, checkboxes, widths, notes', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.menuSetup();
  const m = env.ss.ss.getSheetByName('Mappings');
  // VLOOKUP id columns (D=4 sourceCalId, F=6 destCalId) are hidden.
  assert.ok(m._hiddenColumns.includes(4));
  assert.ok(m._hiddenColumns.includes(6));
  // Checkboxes on enabled (B=2) and busyOnly (L=12).
  assert.ok(m._checkboxCols.includes(2));
  assert.ok(m._checkboxCols.includes(12));
  // Representative column widths from the reference workbook.
  assert.equal(m._colWidths[3], 183);  // Source
  assert.equal(m._colWidths[2], 57);   // enabled
  assert.equal(m._colWidths[12], undefined); // busyOnly keeps default width
  // Header-cell notes.
  assert.equal(m._notes['1,1'], 'unique identifier for this sync rule');
  assert.equal(m._notes['1,6'], 'primary = main calendar');
});

test('menuSetup builds the copyMode dropdown with full, busy, and invite', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.menuSetup();
  const m = env.ss.ss.getSheetByName('Mappings');
  const copyModeCol = g.MAPPING_HEADERS.indexOf('copyMode') + 1; // 1-based
  const rule = m._validations[copyModeCol];
  assert.ok(rule, 'copyMode column has a data-validation rule');
  assert.deepEqual(rule.inList, [g.COPY_MODE.FULL, g.COPY_MODE.BUSY, g.COPY_MODE.INVITE]);
});

test('menuSetup builds the direction dropdown from the implemented directions', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.menuSetup();
  const m = env.ss.ss.getSheetByName('Mappings');
  const directionCol = g.MAPPING_HEADERS.indexOf('direction') + 1; // 1-based
  const rule = m._validations[directionCol];
  assert.ok(rule, 'direction column has a data-validation rule');
  assert.deepEqual(rule.inList, [g.DIRECTION.SOURCE_TO_DEST]);
});

test('menuSetup adds a conditional-format rule to grey out disabled rows', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.menuSetup();
  const mappings = env.ss.ss.getSheetByName('Mappings');
  assert.equal(mappings.getConditionalFormatRules().length, 1);
});

test('refreshCalendarIds lists the account calendars by name then id', () => {
  const env = makeEnv();
  // The CalendarList fake derives its list from calendars that have events.
  env.cal.seed('work@group.calendar.google.com', { summary: 'x' });
  env.cal.seed('home@gmail.com', { summary: 'y' });
  const g = loadGas(env.globals);
  const n = g.refreshCalendarIds();
  const sheet = env.ss.ss.getSheetByName('CalendarIds');
  assert.equal(n, 2);
  assert.deepEqual(sheet.data[0], g.CALENDAR_IDS_HEADERS);
  assert.deepEqual(sheet.data[1], ['primary', 'primary']);
  // Remaining rows are the two calendars (fake reports summary === id), sorted.
  const listed = sheet.data.slice(2).map((r) => r[1]);
  assert.deepEqual(listed, ['home@gmail.com', 'work@group.calendar.google.com']);
});
