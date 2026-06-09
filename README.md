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

## One-time setup

1. **Create a Google Sheet** — this will hold the config and become the script's container.
2. **Install clasp and authorize:**
   ```bash
   npm install
   npx clasp login
   ```
3. **Create the bound Apps Script project** (run once, in this directory):
   ```bash
   npx clasp create --type sheets --title "calendar-sync" --parentId <SHEET_ID>
   ```
   This writes `.clasp.json` (git-ignored). Alternatively copy `.clasp.json.example` to
   `.clasp.json` and paste an existing script id.
4. **Push the code:**
   ```bash
   npx clasp push
   ```
   The `appsscript.json` manifest enables the Advanced Calendar Service automatically.
5. **Authorize & configure in the Sheet:** reload the Sheet, then use the **Calendar Sync**
   menu:
   - **Setup (create tabs)** — creates `Mappings` / `State` / `Log` and a sample row.
   - Fill `Mappings`. Use `primary` as `destCalId` for your main calendar. Get calendar
     ids from the `listMyCalendars` function (editor) or each calendar's settings page.
   - Set `enabled = TRUE` on rows you want.
   - **Run now** — first sync (you'll be prompted to grant Calendar access).
   - **Install schedule** — start the recurring trigger.

## Mappings columns

| Column | Meaning |
|---|---|
| `id` | stable short id, e.g. `org-a` |
| `enabled` | `TRUE`/`FALSE` |
| `sourceCalId` | org calendar id to mirror from |
| `destCalId` | destination calendar id (`primary` = your main) |
| `direction` | `source_to_dest` (only one implemented) |
| `copyMode` | `full` (details, no attendees) or `busy` (opaque "Busy" block) |
| `titlePrefix` | optional prefix on copied titles, e.g. `[Org A] ` |
| `filter` | optional: only mirror events whose title contains this text |
| `busyOnly` | `TRUE` = only mirror events that show as busy (skip free/transparent events) |
| `excludeCreators` | optional comma-separated emails; skip events created or organized by these people |

Filters are evaluated on every sync: if you edit a source event so it stops qualifying
(e.g. change it from busy to free, or rename it out of the `filter`), its existing copy on
the destination is removed on the next run.

## Day-to-day commands

```bash
npx clasp push      # upload local changes to the cloud project
npx clasp pull      # download changes made in the web editor
npx clasp open      # open the script editor in a browser
npx clasp logs      # tail execution logs
```

## Verifying a change

Run `dryRunMapping("<id>")` from the editor to preview create/update/delete counts without
writing anything. Then exercise create → update → delete on a source event and click
**Run now** between each, confirming copies appear / change / disappear on the destination
without duplicates. **Reset all sync tokens** forces a clean full re-sync (no duplicates,
since copies are matched by their stamped properties).
