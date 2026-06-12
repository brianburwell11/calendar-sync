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
    resource.summary = mapping.overrideTitle || 'Busy';
    resource.visibility = 'private';
  } else {
    var baseTitle = mapping.overrideTitle || src.summary || '(no title)';
    resource.summary = (mapping.titlePrefix || '') + baseTitle;
    if (src.description) resource.description = src.description;
    if (src.location) resource.location = src.location;
  }

  // Optional event color. When unset, the copy uses the destination calendar's
  // default color.
  var colorId = colorIdFor_(mapping.color);
  if (colorId) resource.colorId = colorId;

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
 * Whether a source event should be mirrored by this mapping. Combines every
 * optional filter. A source event that does NOT qualify has any existing copy
 * removed by the caller, so changing an event so it stops qualifying (e.g.
 * busy -> free) correctly deletes its mirror.
 * @return {boolean}
 */
function qualifies(src, mapping) {
  if (!passesTitleFilter_(src, mapping)) return false;
  if (mapping.busyOnly && !isBusy_(src)) return false;
  if (creatorExcluded_(src, mapping)) return false;
  return true;
}

/**
 * Title filter: empty => everything passes; otherwise case-insensitive
 * substring match against the event summary.
 * @return {boolean}
 */
function passesTitleFilter_(src, mapping) {
  if (!mapping.filter) return true;
  var summary = String(src.summary || '').toLowerCase();
  return summary.indexOf(mapping.filter.toLowerCase()) !== -1;
}

/**
 * True if the event shows the attendee as busy. Calendar treats a missing
 * `transparency` as "opaque" (busy); only an explicit "transparent" is free.
 * @return {boolean}
 */
function isBusy_(src) {
  return String(src.transparency || 'opaque') !== 'transparent';
}

/**
 * True if the event's creator OR organizer email is in the mapping's
 * excludeCreators list. Useful for events you only attend (not own) that were
 * created by people whose events you don't want mirrored.
 * @return {boolean}
 */
function creatorExcluded_(src, mapping) {
  var exclude = mapping.excludeCreators;
  if (!exclude || !exclude.length) return false;
  var emails = [];
  if (src.creator && src.creator.email) emails.push(String(src.creator.email).toLowerCase());
  if (src.organizer && src.organizer.email) emails.push(String(src.organizer.email).toLowerCase());
  return emails.some(function (e) { return exclude.indexOf(e) !== -1; });
}

/**
 * True if this source event is itself one of our mirrors (echo guard).
 * @return {boolean}
 */
function isOwnMirror(src) {
  var priv = src.extendedProperties && src.extendedProperties.private;
  return !!(priv && priv[CS_PROP.SOURCE_EVENT]);
}
