/**
 * load.js — load the real, unmodified src/*.js Apps Script files into a Node
 * vm context with injected fake globals.
 *
 * This works precisely because Apps Script files share one global scope and use
 * no import/require: concatenating them into a vm context reproduces the runtime
 * closely enough to exercise the real logic, with Calendar/SpreadsheetApp/etc.
 * swapped for in-memory fakes. No production code is modified for tests.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// repo root: test/local/harness -> test/local -> test -> root
const ROOT = path.resolve(__dirname, '..', '..', '..');

// Load order mirrors .clasp.json filePushOrder; for plain function/var decls
// order doesn't actually matter, but we keep it consistent.
const FILES = ['Config', 'State', 'Log', 'EventCopy', 'Sync', 'Triggers', 'Menu']
  .map(function (f) { return path.join('src', f + '.js'); });

const SOURCES = FILES.map(function (rel) {
  return { rel: rel, code: fs.readFileSync(path.join(ROOT, rel), 'utf8') };
});

/**
 * Build a fresh sandbox with the given fake globals and evaluate every src file
 * into it. Returns the context object, whose properties are the GAS globals
 * (syncMapping, getMappings, buildCopyResource, MAPPING_HEADERS, …).
 *
 * @param {Object} globals  fake globals to inject (Calendar, SpreadsheetApp, …)
 * @return {Object} the vm context
 */
function loadGas(globals) {
  const sandbox = Object.assign({
    console: console,
    JSON: JSON, Math: Math, Date: Date, Array: Array, Object: Object,
    String: String, Number: Number, Boolean: Boolean, RegExp: RegExp,
    Error: Error, parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN,
  }, globals || {});
  sandbox.globalThis = sandbox;

  const ctx = vm.createContext(sandbox);
  SOURCES.forEach(function (s) {
    vm.runInContext(s.code, ctx, { filename: s.rel });
  });
  return ctx;
}

module.exports = { loadGas };
