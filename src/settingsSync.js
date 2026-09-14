/**
 * src/settingsSync.js — cross-device sync for small, non-sensitive settings
 *
 * Inkpour's full settings object lives in storage.local as `inkpour_settings`
 * — that stays the single source of truth background.js and everything else
 * reads, unchanged. storage.sync has a hard cap (100KB total, 8KB/item) and
 * throttled writes, so only a safe subset of preferences — UI/behavior
 * toggles, never tokens, file paths, or vault handles — is additionally
 * mirrored there under `inkpour_settings_sync`, letting those specific
 * preferences follow the user across their other signed-in devices while
 * everything sensitive or machine-specific stays local-only.
 *
 * Loaded via <script> in popup.html/settings.html (declares globals, same
 * style as src/utils.js and src/redact.js — no import/export syntax).
 */

const SYNCABLE_SETTING_KEYS = [
  'defaultFormat',
  'pdfAutoPrint',
  'yamlFrontMatter',
  'generateTOC',
  'obsidianTags',
  'gistPublic',
  'scrubSecrets',
  'webhookIncludeContent',
  'debugMode',
  'debugAttachGist',
];

/**
 * Picks just the syncable keys out of a settings object.
 * @param {object|null|undefined} prefs
 * @returns {object}
 */
function pickSyncableSettings(prefs) {
  if (!prefs || typeof prefs !== 'object') return {};
  const out = {};
  for (const key of SYNCABLE_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(prefs, key)) out[key] = prefs[key];
  }
  return out;
}

/**
 * Merges a synced-settings mirror on top of a local settings object — sync
 * wins for the keys it covers, everything else in localPrefs is untouched.
 * Never mutates either input.
 * @param {object|null|undefined} localPrefs
 * @param {object|null|undefined} syncedPrefs
 * @returns {object}
 */
function mergeSyncedSettings(localPrefs, syncedPrefs) {
  return Object.assign({}, localPrefs ?? {}, pickSyncableSettings(syncedPrefs));
}

/**
 * Reads storage.sync's mirror (if any) and merges it over localPrefs.
 * Never throws — storage.sync can be unavailable (no signed-in browser
 * profile), quota-limited, or simply absent (Safari has no storage.sync);
 * any failure just returns localPrefs unchanged.
 * @param {object} api - the browser/chrome extension API object
 * @param {object} localPrefs
 * @returns {Promise<object>}
 */
async function loadWithSyncOverrides(api, localPrefs) {
  try {
    if (!api?.storage?.sync) return localPrefs;
    const result = await api.storage.sync.get('inkpour_settings_sync');
    return mergeSyncedSettings(localPrefs, result?.inkpour_settings_sync);
  } catch (_) {
    return localPrefs;
  }
}

/**
 * Mirrors the syncable subset of prefs to storage.sync. Never throws —
 * storage.local (written separately by the caller) remains the full source
 * of truth regardless of whether this succeeds.
 * @param {object} api
 * @param {object} prefs
 * @returns {Promise<void>}
 */
async function saveSyncableSettings(api, prefs) {
  try {
    if (!api?.storage?.sync) return;
    await api.storage.sync.set({ inkpour_settings_sync: pickSyncableSettings(prefs) });
  } catch (_) {
    // Quota exceeded, no signed-in profile, etc. — local storage already
    // has the full settings object, so preferences aren't lost, they just
    // won't follow the user to another device this time.
  }
}
