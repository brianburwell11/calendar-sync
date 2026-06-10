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

test('seeded sample row resolves ids by VLOOKUP against CalendarIds', () => {
  const env = makeEnv();
  const g = loadGas(env.globals);
  g.menuSetup();
  const row = env.ss.ss.getSheetByName('Mappings').data[1];
  const headers = g.MAPPING_HEADERS;
  // Source/Destination hold names; the id columns hold lookup formulas.
  assert.equal(row[headers.indexOf('Source')], 'primary');
  assert.match(row[headers.indexOf('sourceCalId')], /^=IFERROR\(VLOOKUP\(\$C2,CalendarIds/);
  assert.match(row[headers.indexOf('destCalId')], /^=IFERROR\(VLOOKUP\(\$E2,CalendarIds/);
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
