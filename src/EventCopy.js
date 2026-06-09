/**
 * EventCopy.js — turn a source event into a destination event payload.
 *
 * Never copies attendees (so mirroring never emails org members) and never
 * carries reminders from the source (avoids duplicate notifications).
 */

/**
 * Build the Calendar API event resource to write to the destination.
 * @param {Object} src      a source event resource from Calendar.Events
 * @param {Object} mapping  the mapping row driving this copy
 * @return {Object} event resource suitable for Events.insert/update
 */
function buildCopyResource(src, mapping) {
  var isBusy = mapping.copyMode === COPY_MODE.BUSY;

  var resource = {
    start: src.start,
    end: src.end,
    reminders: { useDefault: false },
    transparency: 'opaque', // mirrored events always count as busy
    extendedProperties: {
      private: {},
    },
  };

  if (isBusy) {
    resource.summary = 'Busy';
    resource.visibility = 'private';
  } else {
    resource.summary = (mapping.titlePrefix || '') + (src.summary || '(no title)');
    if (src.description) resource.description = src.description;
    if (src.location) resource.location = src.location;
  }

  // Preserve recurrence so recurring source events stay recurring on the copy.
  // (Events.list is called without singleEvents on incremental syncs, so the
  // master recurring event flows through with its recurrence rules.)
  if (src.recurrence) resource.recurrence = src.recurrence;

  resource.extendedProperties.private[CS_PROP.SOURCE] = mapping.sourceCalId;
  resource.extendedProperties.private[CS_PROP.SOURCE_EVENT] = src.id;
  resource.extendedProperties.private[CS_PROP.MAPPING] = mapping.id;

  return resource;
}

/**
 * Whether a source event passes the mapping's optional filter.
 * Empty filter => everything passes. Otherwise case-insensitive substring
 * match against the event summary.
 * @return {boolean}
 */
function passesFilter(src, mapping) {
  if (!mapping.filter) return true;
  var summary = String(src.summary || '').toLowerCase();
  return summary.indexOf(mapping.filter.toLowerCase()) !== -1;
}

/**
 * True if this source event is itself one of our mirrors (echo guard).
 * @return {boolean}
 */
function isOwnMirror(src) {
  var priv = src.extendedProperties && src.extendedProperties.private;
  return !!(priv && priv[CS_PROP.SOURCE_EVENT]);
}
