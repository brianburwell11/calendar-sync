# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Google Apps Script project that mirrors events from multiple Google "org" calendars into
one "main" calendar, keeping copies synced on create/update/delete. The script is
**container-bound to a Google Sheet** that serves as both the configuration UI (`Mappings`
tab) and the status surface (`State`, `Log` tabs). Code is developed locally and pushed to
the cloud project with `clasp`.

## Commands

```bash
npm install            # installs @google/clasp (dev dependency)
npx clasp login        # one-time auth
npx clasp push         # upload src/ + test/ + appsscript.json to the cloud project
npx clasp pull         # pull changes made in the web editor back into the repo
npx clasp open         # open the Apps Script editor
npx clasp logs         # tail execution logs
```

`.clasp.json` (git-ignored) binds the repo to a script id; see `.clasp.json.example` and
the README for first-time project creation (`clasp create --type sheets --parentId <SHEET_ID>`).

There is **no local build, lint, or test runner** — Apps Script runs only in Google's
environment. "Tests" are manual functions in `test/manual.js` run from the editor:
`dryRunMapping("<id>")` previews a mapping's create/update/delete counts without writing or
consuming its sync token; `listMyCalendars()` prints calendar ids.

## Runtime model (important, non-obvious)

- **No modules.** Apps Script concatenates every `.js` file into one global scope. There is
  no `import`/`require`; all functions and `var` constants are globally visible. Push order
  is set in `.clasp.json` / `.clasp.json.example` but load order does not matter for
  function definitions.
- **V8 runtime**, but the code is written in conservative ES5-ish style (`var`, `function`)
  to match Apps Script idioms.
- **Trailing-underscore functions** (`pageThrough_`, `findCopy_`, …) are the convention for
  "private" helpers not meant to be invoked as entry points.
- The **Advanced Calendar Service** (`Calendar.Events.*`, API v3) is used instead of the
  built-in `CalendarApp`, because only it exposes sync tokens, `status: "cancelled"` for
  deletes, and `privateExtendedProperty` filtering. It is enabled via `appsscript.json`.

## Architecture (the big picture)

Data flows Sheet → engine → destination calendar, once per trigger tick (default every 5
min) or when **Run now** is clicked:

1. **`Config.js`** reads the `Mappings` tab into mapping objects and defines the shared
   constants: `CS_PROP` (the private-property keys), `SHEET` tab names, `DIRECTION`,
   `COPY_MODE`, `SYNC_WINDOW`, `TRIGGER_EVERY_MINUTES`.
2. **`Sync.js`** is the engine. `syncAll()` iterates enabled mappings (isolating per-mapping
   errors). `syncMapping()` lists source changes incrementally and applies them.
3. **`State.js`** persists, per mapping, the Calendar API **sync token** plus last-run
   metadata in `ScriptProperties`, mirrored to the `State` tab.
4. **`EventCopy.js`** builds the destination event payload and holds the guard predicates.
5. **`Log.js`** appends run rows to the `Log` tab.
6. **`Menu.js`** (`onOpen`) is the in-Sheet control surface; **`Triggers.js`** installs/
   removes the time-driven trigger.

### The three mechanisms that make sync correct

- **Incremental sync via tokens.** `listSourceChanges_` calls `Calendar.Events.list` with
  the stored `syncToken` to get only what changed; the new `nextSyncToken` is saved only on
  the final page (`pageThrough_`). No token (first run) or a `410`/expired token triggers a
  bounded **full sync** over `SYNC_WINDOW` and re-saves a fresh token. When a sync token is
  present the API forbids other filters, so `baseListOpts_` sends *only* the token.
- **Linking copies to sources via private properties.** Every copy is stamped with
  `csSourceEventId` + `csMapping` + `csSource` in `extendedProperties.private`. To update or
  delete, `findCopy_` queries the destination by `privateExtendedProperty`. This is why
  there is **no separate ID-map store** and why a full re-sync never duplicates: existing
  copies are re-discovered by these stamps.
- **Echo guard.** `isOwnMirror` skips any source event that itself carries our stamp, so the
  engine never mirrors a mirror. This is what will keep Phase 2 (write-back to org
  calendars) from feeding on its own output.

### Conventions that protect users

- Mirrored events **never copy attendees** and always pass `sendUpdates: "none"`, so syncing
  cannot email org members. `copyMode: "busy"` copies only an opaque "Busy" block.
- `dryRun` paths must never write events **and never persist a sync token** — preserve this
  when editing `syncMapping`/`pageThrough_`, or previews would silently consume changes.

## Not built yet (designed for)

Phase 2: `direction: "dest_to_source"` to conditionally write unavailability blocks back
onto an org's availability calendar. `syncMapping` currently skips any direction other than
`source_to_dest`. Reuse the existing private-property stamping and echo guard when adding it.
