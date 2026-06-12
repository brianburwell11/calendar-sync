# calendar-sync

Mirror events from multiple Google **org** calendars into one **main** calendar,
keeping the copies in sync as source events are created, updated, and deleted.

- **Engine:** Google Apps Script (free, Google-hosted), container-bound to a Google Sheet.
- **Config & status:** the Sheet itself — a `Mappings` tab plus `State` and `Log` tabs.
- **Cadence:** a time-driven trigger runs every few minutes and only fetches what
  changed, using Calendar API incremental sync tokens.

A later phase will optionally write **unavailability blocks back** onto an org's
availability calendar; it is designed for but not built yet.

## How it works

Each enabled row in `Mappings` defines a sync: `sourceCalId → destCalId`. On every run
the engine asks the Calendar API for changes to the source since the last run (via a
stored sync token), then for each change creates / updates / deletes the matching copy on
the destination. Copies carry hidden private properties (`csSourceEventId`, `csMapping`,
`csSource`) so the engine can find the right copy to update or delete — and never mirrors
one of its own copies. See the architecture overview in `CLAUDE.md`.

Mirrored events **never copy attendees and never send invitations**, so syncing can't
email org members.

## Setup & install (browser only — nothing to install)

You do **not** need git, Node, npm, or any developer tools. Everything below happens
in your web browser with a normal Google account. It takes about 10 minutes.

### Step 1 — Create the Google Sheet

1. Go to **[sheets.new](https://sheets.new)** (or Google Drive → **New → Google Sheets**).
2. Give it a name like **Calendar Sync**. This Sheet will hold your settings and status.

### Step 2 — Open the built-in script editor

In the Sheet, click the **Extensions** menu → **Apps Script**. A new browser tab opens with
an empty project. This project is now permanently attached to your Sheet — there is nothing
to "connect" or install.

### Step 3 — Download the code from GitHub

1. Go to the project's GitHub page —
   **[github.com/brianburwell11/calendar-sync](https://github.com/brianburwell11/calendar-sync)** —
   and click the green **`< > Code`** button → **Download ZIP**.
   (Direct link: **[download the ZIP](https://github.com/brianburwell11/calendar-sync/archive/refs/heads/main.zip)**.)
2. Find the downloaded `.zip` in your Downloads folder and **double-click it to unzip**.
   You'll get a folder containing a `src` folder (the code) and an `appsscript.json` file
   (the settings).

### Step 4 — Copy the code files into the editor

The editor needs **7 code files**. They are the files inside the `src` folder: `Config.js`,
`Sync.js`, `State.js`, `EventCopy.js`, `Log.js`, `Menu.js`, and `Triggers.js`. To open any of
them, right-click the file → **Open With → TextEdit** (Mac) or **Notepad** (Windows), then
select all and copy.

In the Apps Script editor (left sidebar, under **Files**):

1. There's already a file named **`Code.gs`**. Hover it, click the **⋮** → **Rename**, and
   name it **`Config`** (the editor adds `.gs` for you). Delete whatever sample code is in
   it, then paste in the contents of **`Config.js`**.
2. For each of the other six files, click the **`+`** next to **Files** → **Script**, type
   the name (e.g. **`Sync`**), and paste in the contents of the matching `src` file.
3. *(Optional but handy)* Add one more script file named **`manual`** and paste in the
   contents of **`test/manual.js`** from the unzipped folder. It adds a `listMyCalendars`
   helper used below to find calendar IDs.

> File order and names-with-`.gs` don't matter — Apps Script merges all the code together.

### Step 5 — Add the settings file (turns on Calendar access)

1. In the editor, click the **gear icon** (⚙ **Project Settings**) in the left sidebar.
2. Check **"Show `appsscript.json` manifest file in editor"**.
3. Go back to **Files** (the `< >` icon). You'll now see **`appsscript.json`**. Click it,
   select all, delete it, and paste in the contents of the **`appsscript.json`** file from
   the unzipped folder. This turns on the Calendar service and the needed permissions.
4. *(Optional)* In that file, change `"timeZone"` to your own, e.g.
   `"America/Los_Angeles"`, so timestamps in the Log/State tabs show in your local time.
5. Click the **Save** icon (💾), or press **Ctrl/Cmd + S**.

### Step 6 — Set up and authorize from the Sheet

1. Switch back to your **Sheet** browser tab and **reload the page**.
2. A new **Calendar Sync** menu appears (to the right of **Help**). If it's not there yet,
   wait a few seconds and reload again.
3. Click **Calendar Sync → Setup (create tabs)**. The first time, Google asks you to
   **authorize**: choose your account and click **Allow**. Because this is your own private
   script, you may see an "unverified app" warning — click **Advanced → Go to … (unsafe)**
   to continue. (It's "unsafe" only because Google hasn't reviewed your personal script; the
   code never emails anyone or shares data.)
4. This creates the **`Mappings`**, **`State`**, **`Log`**, and **`CalendarIds`** tabs plus
   one sample row. `CalendarIds` is filled with all your calendars automatically — if it's
   empty (Google may have asked for calendar access only just now), click
   **Calendar Sync → Refresh calendar list**.

### Step 7 — Configure your sync

1. In the **`Mappings`** tab, fill in the sample row (columns explained below):
   - **`Source`** — pick the calendar to mirror **from** using the dropdown (the names come
     from the `CalendarIds` tab). The **`sourceCalId`** column fills in automatically.
   - **`Destination`** — pick the calendar to mirror **to**; use **`primary`** for your main
     calendar. **`destCalId`** fills in automatically.
   - You never need to find or paste calendar ids — picking the **name** is enough.
2. Set **`enabled` = `TRUE`** on the rows you want to sync.
3. Click **Calendar Sync → Run now** for the first sync.
4. Click **Calendar Sync → Install schedule** to start the automatic recurring sync.
   Use **Set schedule interval…** to change how often it runs.

You're done — the sync now runs on its own in the background, even when your computer and
the Sheet are closed.

## For developers: install with clasp

If you have Node.js installed and prefer command-line workflow, you can push the code with
[`clasp`](https://github.com/google/clasp) instead of copy-pasting:

1. **Create a Google Sheet** to act as the container.
2. **Clone the repo and install clasp, then authorize:**
   ```bash
   git clone git@github.com:brianburwell11/calendar-sync.git
   cd calendar-sync
   npm install
   npx clasp login
   ```
3. **Create the bound Apps Script project** (run once, in this directory):
   ```bash
   npx clasp create --type sheets --title "Calendar Sync"
   ```
   This writes `.clasp.json` (git-ignored). Alternatively copy `.clasp.json.example` to
   `.clasp.json` and paste an existing script id.
4. **Push the code:**
   ```bash
   npx clasp push
   ```
   The `appsscript.json` manifest enables the Advanced Calendar Service automatically.
5. Then reload the Sheet and follow **Step 6–7** above to authorize and configure.

## Mappings columns

| Column | Meaning |
|---|---|
| `id` | stable short id, e.g. `org-a` |
| `enabled` | `TRUE`/`FALSE` — disabled (`FALSE`) rows are greyed out and struck through |
| `Source` | the calendar to mirror **from**, picked **by name** from the dropdown (the names come from the `CalendarIds` tab) |
| `sourceCalId` | **auto-filled** — a `VLOOKUP` that resolves the `Source` name to its calendar id; don't edit by hand |
| `Destination` | the calendar to mirror **to**, picked by name (use `primary` for your main calendar) |
| `destCalId` | **auto-filled** — `VLOOKUP` of the `Destination` name to its id |
| `direction` | `source_to_dest` (only one implemented) |
| `copyMode` | `full` (details, no attendees), `busy` (opaque "Busy" block), or `invite` (no copy — adds the Destination calendar as an attendee on the **source** event, so the event shows on the destination directly). `invite` requires write access to the Source calendar and never sends invitation emails. |
| `titlePrefix` | optional prefix on copied titles, e.g. `[Org A] ` |
| `overrideTitle` | optional: if set, replaces every mirrored title with this text (source title ignored); `titlePrefix` still applies |
| `filter` | optional: only mirror events whose title contains this text (matches the *source* title, even when overridden) |
| `busyOnly` | `TRUE` = only mirror events that show as busy (skip free/transparent events) |
| `excludeCreators` | optional comma-separated emails; skip events created or organized by these people |
| `color` | optional event color for copies (`full`/`busy` modes). Pick a name from the dropdown or type a number `1`–`11`. Blank = the destination calendar's default color. Ignored by `invite` mode (which creates no copy to color). Accepted names: `Lavender` (1), `Sage` (2), `Grape` (3), `Flamingo` (4), `Banana` (5), `Tangerine` (6), `Peacock` (7), `Graphite` (8), `Blueberry` (9), `Basil` (10), `Tomato` (11). |

Filters are evaluated on every sync: if you edit a source event so it stops qualifying
(e.g. change it from busy to free, or rename it out of the `filter`), its existing copy on
the destination is removed on the next run.

### The CalendarIds tab (pick calendars by name)

So you never have to find or paste long calendar ids, **Setup** also creates a `CalendarIds`
tab listing every calendar your account can see as **name → id** (plus a `primary` row for
your main calendar). The `Source` and `Destination` columns on `Mappings` are dropdowns of
those names; the `sourceCalId` / `destCalId` columns are `VLOOKUP` formulas that fill in the
matching id automatically.

If you add or rename a calendar later, click **Calendar Sync → Refresh calendar list** to
rebuild the tab. (Power users can still type a raw id or `primary` straight into the
`Source`/`Destination` cells — invalid dropdown values are allowed.)

## Day-to-day commands

```bash
npx clasp push      # upload local changes to the cloud project
npx clasp pull      # download changes made in the web editor
npx clasp open      # open the script editor in a browser
npx clasp logs      # tail execution logs
```

## Tests

```bash
npm test    # offline Node suite — no Google auth required
```

The suite in `test/local/` loads the real `src/*.js` into a sandbox with in-memory fakes
for the Google services, so it exercises the actual sync logic (incremental tokens,
create/update/delete, echo guard, filters) without touching any calendar. These files are
Node-only and are never pushed to Apps Script (`.claspignore`).

## Verifying a change against real calendars

Run `dryRunMapping("<id>")` from the editor to preview create/update/delete counts without
writing anything. Then exercise create → update → delete on a source event and click
**Run now** between each, confirming copies appear / change / disappear on the destination
without duplicates. **Reset all sync tokens** forces a clean full re-sync (no duplicates,
since copies are matched by their stamped properties).
