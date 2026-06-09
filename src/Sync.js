/**
 * Sync.js — the engine. Mirrors source-calendar changes into the destination
 * calendar using Calendar API incremental sync tokens.
 *
 * Entry points:
 *   syncAll()              — run every enabled mapping (used by the trigger & menu)
 *   syncMapping(m, dryRun) — run one mapping; dryRun=true previews without writing
 */

/** Run all enabled mappings, isolating errors so one bad mapping can't halt the rest. */
function syncAll() {
  var mappings = getMappings();
  if (!mappings.length) {
    logWarn('', 'No mappings found. Add rows to the "' + SHEET.MAPPINGS + '" tab.');
    return;
  }
  mappings.forEach(function (m) {
    if (!m.enabled) return;
    try {
      var result = syncMapping(m, false);
      recordRun(m.id, result);
      logInfo(m.id, 'Synced: +' + result.created + ' ~' + result.updated +
        ' -' + result.deleted + (result.errors ? ' (errors: ' + result.errors + ')' : ''));
    } catch (e) {
      logError(m.id, String(e && e.stack ? e.stack : e));
      recordRun(m.id, { created: 0, updated: 0, deleted: 0, errors: 1, note: String(e) });
    }
  });
}

/**
 * Sync a single mapping.
 * @param {Object} mapping
 * @param {boolean} dryRun  if true, computes counts but writes nothing and does
 *                          not persist a sync token.
 * @return {{created:number, updated:number, deleted:number, errors:number, note:string}}
 */
function syncMapping(mapping, dryRun) {
  var result = { created: 0, updated: 0, deleted: 0, errors: 0, note: '' };

  if (mapping.direction !== DIRECTION.SOURCE_TO_DEST) {
    result.note = 'Skipped: direction "' + mapping.direction + '" not yet implemented';
    return result;
  }

  var events = listSourceChanges_(mapping, dryRun, result);

  events.forEach(function (src) {
    try {
      if (isOwnMirror(src)) return; // echo guard: never mirror a mirror

      if (src.status === 'cancelled') {
        applyDelete_(mapping, src, dryRun, result);
        return;
      }
      if (!passesFilter(src, mapping)) return;

      applyUpsert_(mapping, src, dryRun, result);
    } catch (e) {
      result.errors++;
      logError(mapping.id, 'event ' + src.id + ': ' + (e && e.message ? e.message : e));
    }
  });

  return result;
}

/**
 * List the source events to process. Uses the stored sync token for an
 * incremental delta; on first run (no token) or an expired token (410), does a
 * bounded full sync. Persists the new nextSyncToken unless dryRun.
 * @return {Array<Object>}
 */
function listSourceChanges_(mapping, dryRun, result) {
  var token = getSyncToken(mapping.id);
  try {
    return pageThrough_(mapping, token, dryRun);
  } catch (e) {
    if (isExpiredTokenError_(e)) {
      logWarn(mapping.id, 'Sync token expired; performing full re-sync.');
      if (!dryRun) resetSyncToken(mapping.id);
      result.note = 'token expired -> full resync';
      return pageThrough_(mapping, null, dryRun);
    }
    throw e;
  }
}

/**
 * Page through Calendar.Events.list, accumulating events and (on the final
 * page) persisting nextSyncToken.
 * @return {Array<Object>}
 */
function pageThrough_(mapping, token, dryRun) {
  var collected = [];
  var pageToken = null;

  do {
    var opts = baseListOpts_(token);
    if (pageToken) opts.pageToken = pageToken;

    var resp = Calendar.Events.list(mapping.sourceCalId, opts);
    if (resp.items) collected = collected.concat(resp.items);

    pageToken = resp.nextPageToken || null;

    if (!pageToken && resp.nextSyncToken && !dryRun) {
      setSyncToken(mapping.id, resp.nextSyncToken);
    }
  } while (pageToken);

  return collected;
}

/**
 * List options. With a sync token the API forbids most other filters, so only
 * the token (and pageToken) may be sent. Without one, do a bounded full sync.
 * singleEvents is false so recurring masters flow through with their rules.
 */
function baseListOpts_(token) {
  if (token) {
    return { syncToken: token, maxResults: 250 };
  }
  var now = new Date();
  var timeMin = new Date(now.getTime() - SYNC_WINDOW.PAST_DAYS * 86400000);
  var timeMax = new Date(now.getTime() + SYNC_WINDOW.FUTURE_DAYS * 86400000);
  return {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: false,
    showDeleted: false,
    maxResults: 250,
  };
}

/** Create or update the destination copy for a source event. */
function applyUpsert_(mapping, src, dryRun, result) {
  var existing = findCopy_(mapping.destCalId, src.id, mapping.id);
  var resource = buildCopyResource(src, mapping);

  if (existing) {
    if (!dryRun) {
      Calendar.Events.update(resource, mapping.destCalId, existing.id, { sendUpdates: 'none' });
    }
    result.updated++;
  } else {
    if (!dryRun) {
      Calendar.Events.insert(resource, mapping.destCalId, { sendUpdates: 'none' });
    }
    result.created++;
  }
}

/** Delete the destination copy for a cancelled source event, if present. */
function applyDelete_(mapping, src, dryRun, result) {
  var existing = findCopy_(mapping.destCalId, src.id, mapping.id);
  if (!existing) return;
  if (!dryRun) {
    Calendar.Events.remove(mapping.destCalId, existing.id, { sendUpdates: 'none' });
  }
  result.deleted++;
}

/**
 * Find an existing mirror copy on the destination by its stamped private
 * properties. Returns the event resource or null.
 * @return {Object|null}
 */
function findCopy_(destCalId, sourceEventId, mappingId) {
  var resp = Calendar.Events.list(destCalId, {
    privateExtendedProperty: [
      CS_PROP.SOURCE_EVENT + '=' + sourceEventId,
      CS_PROP.MAPPING + '=' + mappingId,
    ],
    showDeleted: false,
    maxResults: 5,
  });
  if (resp.items && resp.items.length) return resp.items[0];
  return null;
}

/** Detect the Calendar API "410 Gone / sync token no longer valid" condition. */
function isExpiredTokenError_(e) {
  var msg = String(e && e.message ? e.message : e);
  return msg.indexOf('410') !== -1 ||
    msg.toLowerCase().indexOf('sync token') !== -1 ||
    msg.toLowerCase().indexOf('fullsyncrequired') !== -1;
}
