/**
 * fakes.js — in-memory fakes for the Apps Script global services used by the
 * engine: Calendar (Advanced Calendar Service), PropertiesService,
 * SpreadsheetApp, and ScriptApp.
 *
 * The Calendar fake models just enough of the v3 API to exercise the engine:
 * incremental sync tokens (per-calendar version cursor), cancelled tombstones,
 * privateExtendedProperty filtering, pagination, and one-shot 410 expiry.
 */

// ---------------------------------------------------------------------------
// PropertiesService
// ---------------------------------------------------------------------------
function makeFakeProperties() {
  const store = new Map();
  const props = {
    getProperty: function (k) { return store.has(k) ? store.get(k) : null; },
    setProperty: function (k, v) { store.set(k, String(v)); return props; },
    deleteProperty: function (k) { store.delete(k); return props; },
    getProperties: function () { return Object.fromEntries(store); },
  };
  return { PropertiesService: { getScriptProperties: function () { return props; } }, store: store };
}

// ---------------------------------------------------------------------------
// Calendar (Advanced Calendar Service v3)
// ---------------------------------------------------------------------------
function makeFakeCalendar() {
  const cals = new Map();
  let idSeq = 0;

  function cal(calId) {
    if (!cals.has(calId)) cals.set(calId, { events: new Map(), version: 0, expire: false, fail: false });
    return cals.get(calId);
  }
  function bump(c, ev) { c.version += 1; ev._version = c.version; }
  function clone(ev) { return JSON.parse(JSON.stringify(ev)); }

  function matchesPriv(ev, filters) {
    const priv = (ev.extendedProperties && ev.extendedProperties.private) || {};
    return filters.every(function (f) {
      const i = f.indexOf('=');
      const k = f.slice(0, i);
      const v = f.slice(i + 1);
      return String(priv[k]) === v;
    });
  }

  const Calendar = {
    Events: {
      list: function (calId, opts) {
        opts = opts || {};
        const c = cal(calId);
        if (c.fail) throw new Error('Simulated Calendar API failure for ' + calId);

        let items = Array.from(c.events.values());

        if (opts.syncToken) {
          if (c.expire) { c.expire = false; throw new Error('Sync token is no longer valid, a full sync is required. [410]'); }
          const v = parseInt(String(opts.syncToken).split(':')[1], 10) || 0;
          items = items.filter(function (ev) { return (ev._version || 0) > v; }); // includes cancelled tombstones
        } else {
          if (!opts.showDeleted) items = items.filter(function (ev) { return ev.status !== 'cancelled'; });
        }

        if (opts.privateExtendedProperty) {
          const filters = [].concat(opts.privateExtendedProperty);
          items = items.filter(function (ev) { return matchesPriv(ev, filters); });
          if (!opts.showDeleted) items = items.filter(function (ev) { return ev.status !== 'cancelled'; });
        }

        const max = opts.maxResults || 250;
        const start = opts.pageToken ? parseInt(opts.pageToken, 10) : 0;
        const page = items.slice(start, start + max).map(clone);
        const resp = { items: page };
        if (start + max < items.length) resp.nextPageToken = String(start + max);
        else resp.nextSyncToken = 'tok:' + c.version;
        return resp;
      },
      insert: function (resource, calId, opts) {
        const c = cal(calId);
        const ev = clone(resource);
        ev.id = 'gen-' + (++idSeq);
        if (!ev.status) ev.status = 'confirmed';
        c.events.set(ev.id, ev);
        bump(c, ev);
        return clone(ev);
      },
      update: function (resource, calId, eventId, opts) {
        const c = cal(calId);
        const ev = clone(resource);
        ev.id = eventId;
        if (!ev.status) ev.status = 'confirmed';
        c.events.set(eventId, ev);
        bump(c, ev);
        return clone(ev);
      },
      remove: function (calId, eventId, opts) {
        const c = cal(calId);
        const ev = c.events.get(eventId);
        if (ev) { ev.status = 'cancelled'; bump(c, ev); }
        return {};
      },
    },
    CalendarList: {
      list: function () {
        return {
          items: Array.from(cals.keys()).map(function (id) {
            return { id: id, summary: id, accessRole: 'owner' };
          }),
        };
      },
    },
  };

  const helpers = {
    cals: cals,
    /** Add/replace a source event (bumps the calendar version). Returns its id. */
    seed: function (calId, ev) {
      const c = cal(calId);
      ev = Object.assign({}, ev);
      if (!ev.id) ev.id = 'src-' + (++idSeq);
      if (!ev.status) ev.status = 'confirmed';
      c.events.set(ev.id, ev);
      bump(c, ev);
      return ev.id;
    },
    cancel: function (calId, eventId) {
      const c = cal(calId);
      const ev = c.events.get(eventId);
      if (ev) { ev.status = 'cancelled'; bump(c, ev); }
    },
    all: function (calId) { return Array.from(cal(calId).events.values()); },
    live: function (calId) { return this.all(calId).filter(function (e) { return e.status !== 'cancelled'; }); },
    /** Make the next incremental list on this calendar throw a one-shot 410. */
    expireToken: function (calId) { cal(calId).expire = true; },
    /** Make every list on this calendar throw (to test error isolation). */
    failList: function (calId) { cal(calId).fail = true; },
  };

  return { Calendar: Calendar, helpers: helpers };
}

// ---------------------------------------------------------------------------
// SpreadsheetApp (minimal: enough for Config/State/Log/Menu)
// ---------------------------------------------------------------------------
function makeFakeSheet(name) {
  const data = []; // data[r-1][c-1]
  let condRules = [];
  const colWidths = {};   // col -> px
  const hiddenCols = [];  // 1-based column indexes hidden
  const checkboxCols = []; // columns where checkboxes were inserted
  const notes = {};       // 'r,c' -> note text
  const sheet = {
    name: name,
    data: data,
    _get: function (r, c) {
      const row = data[r - 1];
      if (!row) return '';
      return row[c - 1] === undefined ? '' : row[c - 1];
    },
    _set: function (r, c, v) {
      while (data.length < r) data.push([]);
      const row = data[r - 1];
      while (row.length < c) row.push('');
      row[c - 1] = v;
    },
    getName: function () { return name; },
    getLastRow: function () { return data.length; },
    getLastColumn: function () {
      return data.reduce(function (m, row) { return Math.max(m, row.length); }, 0);
    },
    getDataRange: function () {
      return makeFakeRange(sheet, 1, 1, Math.max(data.length, 1), Math.max(sheet.getLastColumn(), 1));
    },
    getRange: function (r, c, nr, nc) { return makeFakeRange(sheet, r, c, nr || 1, nc || 1); },
    appendRow: function (vals) {
      const r = data.length + 1;
      for (let c = 0; c < vals.length; c++) sheet._set(r, c + 1, vals[c]);
    },
    setFrozenRows: function () { return sheet; },
    autoResizeColumns: function () { return sheet; },
    clear: function () { data.length = 0; return sheet; },
    getMaxRows: function () { return Math.max(data.length, 1000); },
    getConditionalFormatRules: function () { return condRules.slice(); },
    setConditionalFormatRules: function (r) { condRules = r.slice(); return sheet; },
    setColumnWidth: function (c, w) { colWidths[c] = w; return sheet; },
    hideColumns: function (c, n) {
      const k = n || 1;
      for (let i = 0; i < k; i++) hiddenCols.push(c + i);
      return sheet;
    },
    _addCheckboxes: function (c) { checkboxCols.push(c); },
    _setNote: function (r, c, t) { notes[r + ',' + c] = t; },
    // Test-only accessors:
    _colWidths: colWidths,
    _hiddenColumns: hiddenCols,
    _checkboxCols: checkboxCols,
    _notes: notes,
  };
  return sheet;
}

function makeFakeRange(sheet, row, col, numRows, numCols) {
  const range = {
    setValues: function (vals) {
      for (let r = 0; r < vals.length; r++)
        for (let c = 0; c < vals[r].length; c++) sheet._set(row + r, col + c, vals[r][c]);
      return range;
    },
    setValue: function (v) { sheet._set(row, col, v); return range; },
    setFormulaR1C1: function (f) {
      for (let r = 0; r < numRows; r++)
        for (let c = 0; c < numCols; c++) sheet._set(row + r, col + c, f);
      return range;
    },
    setDataValidation: function () { return range; },
    setNote: function (t) { sheet._setNote(row, col, t); return range; },
    insertCheckboxes: function () { sheet._addCheckboxes(col); return range; },
    setFontFamily: function () { return range; },
    setBackground: function () { return range; },
    getBandings: function () { return []; },
    applyRowBanding: function () { return { remove: function () {} }; },
    getValues: function () {
      const out = [];
      for (let r = 0; r < numRows; r++) {
        const line = [];
        for (let c = 0; c < numCols; c++) line.push(sheet._get(row + r, col + c));
        out.push(line);
      }
      return out;
    },
    setFontWeight: function () { return range; },
  };
  return range;
}

function makeFakeSpreadsheet(initialSheets) {
  const sheets = new Map();
  (initialSheets || []).forEach(function (s) { sheets.set(s.name, s); });
  const ss = {
    getSheetByName: function (n) { return sheets.get(n) || null; },
    insertSheet: function (n) { const s = makeFakeSheet(n); sheets.set(n, s); return s; },
    toast: function () {},
    getId: function () { return 'fake-ss'; },
  };
  const ui = {
    alert: function () { return 'ok'; },
    prompt: function () { return { getResponseText: function () { return ''; } }; },
    ButtonSet: { OK_CANCEL: 'OK_CANCEL', OK: 'OK' },
    Button: { OK: 'OK', CANCEL: 'CANCEL' },
    createMenu: function () {
      const menu = {
        addItem: function () { return menu; },
        addSeparator: function () { return menu; },
        addToUi: function () {},
      };
      return menu;
    },
  };
  const SpreadsheetApp = {
    getActive: function () { return ss; },
    getUi: function () { return ui; },
    newDataValidation: function () {
      const b = {
        requireValueInRange: function () { return b; },
        requireValueInList: function () { return b; },
        setAllowInvalid: function () { return b; },
        build: function () { return {}; },
      };
      return b;
    },
    BandingTheme: { LIGHT_GREY: 'LIGHT_GREY' },
    newConditionalFormatRule: function () {
      const b = {
        whenFormulaSatisfied: function () { return b; },
        setStrikethrough: function () { return b; },
        setFontColor: function () { return b; },
        setBold: function () { return b; },
        setItalic: function () { return b; },
        setBackground: function () { return b; },
        setRanges: function () { return b; },
        build: function () { return {}; },
      };
      return b;
    },
  };
  return { SpreadsheetApp: SpreadsheetApp, ss: ss, sheets: sheets };
}

/** Build a fake sheet preloaded with a 2D array of values. */
function sheetWith(name, values) {
  const s = makeFakeSheet(name);
  values.forEach(function (row, r) {
    row.forEach(function (v, c) { s._set(r + 1, c + 1, v); });
  });
  return s;
}

// ---------------------------------------------------------------------------
// ScriptApp (triggers)
// ---------------------------------------------------------------------------
function makeFakeScriptApp() {
  let triggers = [];
  const ScriptApp = {
    getProjectTriggers: function () { return triggers.slice(); },
    deleteTrigger: function (t) { triggers = triggers.filter(function (x) { return x !== t; }); },
    newTrigger: function (fn) {
      const builder = {
        every: null,
        timeBased: function () { return builder; },
        everyMinutes: function (m) { builder.every = m; return builder; },
        everyHours: function (h) { builder.every = h * 60; return builder; },
        create: function () {
          const t = { handler: fn, everyMinutes: builder.every, getHandlerFunction: function () { return fn; } };
          triggers.push(t);
          return t;
        },
      };
      return builder;
    },
  };
  return { ScriptApp: ScriptApp, triggers: function () { return triggers; } };
}

// ---------------------------------------------------------------------------
// Convenience: assemble a full environment
// ---------------------------------------------------------------------------
function makeEnv(opts) {
  opts = opts || {};
  const calEnv = makeFakeCalendar();
  const propsEnv = makeFakeProperties();
  const ssEnv = makeFakeSpreadsheet(opts.sheets);
  const scriptEnv = makeFakeScriptApp();
  const globals = {
    Calendar: calEnv.Calendar,
    PropertiesService: propsEnv.PropertiesService,
    SpreadsheetApp: ssEnv.SpreadsheetApp,
    ScriptApp: scriptEnv.ScriptApp,
  };
  return {
    globals: globals,
    cal: calEnv.helpers,
    props: propsEnv,
    ss: ssEnv,
    script: scriptEnv,
  };
}

/** Build a mapping object with sensible defaults (overridable). */
function mapping(overrides) {
  return Object.assign({
    id: 'm1',
    enabled: true,
    sourceCalId: 'src@cal',
    destCalId: 'dst@cal',
    direction: 'source_to_dest',
    copyMode: 'full',
    titlePrefix: '',
    overrideTitle: '',
    filter: '',
    busyOnly: false,
    excludeCreators: [],
  }, overrides || {});
}

/** A minimal valid timed event resource. */
function timedEvent(over) {
  return Object.assign({
    summary: 'Event',
    start: { dateTime: '2026-07-01T10:00:00-04:00' },
    end: { dateTime: '2026-07-01T11:00:00-04:00' },
    creator: { email: 'someone@example.com' },
    organizer: { email: 'someone@example.com' },
  }, over || {});
}

module.exports = {
  makeFakeProperties: makeFakeProperties,
  makeFakeCalendar: makeFakeCalendar,
  makeFakeSpreadsheet: makeFakeSpreadsheet,
  makeFakeScriptApp: makeFakeScriptApp,
  makeFakeSheet: makeFakeSheet,
  sheetWith: sheetWith,
  makeEnv: makeEnv,
  mapping: mapping,
  timedEvent: timedEvent,
};
