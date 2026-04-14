// @ts-check
// session-bookmarks.mjs — pure helpers for session bookmark & tag data.
// No DOM or localStorage calls — those stay in app.js.
//
// Build integration: the generator strips `export ` keywords and prepends
// the file to app.js. Source of truth lives here — don't edit the inlined
// copy.

/**
 * @typedef {{ starred: boolean, tags: string[] }} BookmarkEntry
 */

/**
 * @typedef {Object<string, BookmarkEntry>} BookmarkMap
 */

/**
 * Parse a raw JSON string into a BookmarkMap.
 * Returns an empty object for invalid input.
 * @param {string|null} raw
 * @returns {BookmarkMap}
 */
export function loadBookmarks(raw) {
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed;
  } catch (e) {
    return {};
  }
}

/**
 * Serialize a BookmarkMap to JSON string.
 * Prunes entries with no star and no tags.
 * @param {BookmarkMap} map
 * @returns {string}
 */
export function saveBookmarks(map) {
  var clean = {};
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    var entry = map[keys[i]];
    if (entry.starred || (entry.tags && entry.tags.length > 0)) {
      clean[keys[i]] = entry;
    }
  }
  return JSON.stringify(clean);
}

/**
 * Toggle the star state for a session. Returns a new map.
 * @param {BookmarkMap} map
 * @param {string} sessionId
 * @returns {BookmarkMap}
 */
export function toggleStar(map, sessionId) {
  var result = Object.assign({}, map);
  var existing = result[sessionId] || { starred: false, tags: [] };
  result[sessionId] = { starred: !existing.starred, tags: existing.tags || [] };
  return result;
}

/**
 * Set tags for a session. Returns a new map.
 * @param {BookmarkMap} map
 * @param {string} sessionId
 * @param {string[]} tags
 * @returns {BookmarkMap}
 */
export function setTags(map, sessionId, tags) {
  var result = Object.assign({}, map);
  var existing = result[sessionId] || { starred: false, tags: [] };
  result[sessionId] = { starred: existing.starred, tags: tags };
  return result;
}

/**
 * Filter sessions by bookmark criteria.
 * @param {Array<{id: string}>} sessions
 * @param {BookmarkMap} map
 * @param {{ starredOnly?: boolean, tagFilter?: string }} opts
 * @returns {Array<{id: string}>}
 */
export function filterSessions(sessions, map, opts) {
  if (!opts.starredOnly && !opts.tagFilter) return sessions;
  return sessions.filter(function(s) {
    var entry = map[s.id];
    if (!entry) return false;
    if (opts.starredOnly && !entry.starred) return false;
    if (opts.tagFilter && (!entry.tags || entry.tags.indexOf(opts.tagFilter) === -1)) return false;
    return true;
  });
}

/**
 * Collect all unique tags across all bookmarks, sorted alphabetically.
 * @param {BookmarkMap} map
 * @returns {string[]}
 */
export function allTags(map) {
  var tagSet = {};
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    var tags = map[keys[i]].tags || [];
    for (var j = 0; j < tags.length; j++) {
      tagSet[tags[j]] = true;
    }
  }
  return Object.keys(tagSet).sort();
}
