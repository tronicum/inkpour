/**
 * src/exportArchive.js — uncapped local export archive (IndexedDB)
 *
 * The rolling `inkpour_history` list in chrome.storage.local keeps only the
 * last 20 exports — anything older used to be gone from local storage forever,
 * which made Inkpour's own local retention *worse* than what a Gist or Notion
 * upload gives the user externally. This module fixes that: every export is
 * additionally mirrored, full content included, into a dedicated IndexedDB
 * database with no entry cap ("effectively uncapped, let the user manage disk
 * space themselves" — matching the local-first philosophy; the History page
 * has a "Clear archive" button for exactly that). The storage.local quick list
 * is untouched and keeps working exactly as before — this is strictly additive.
 *
 * Why IndexedDB and not storage.local: chrome.storage.local has practical size
 * limits and JSON-only round-tripping; IndexedDB is the browser-native store
 * for a collection that grows to hundreds of full conversation transcripts,
 * and is available in extension-page contexts (popup, history page).
 *
 * Loaded by popup.html and history.html via <script> (same convention as
 * src/utils.js / src/vaultHandle.js — plain global functions, no
 * import/export syntax, so it works directly as a page <script> and can be
 * pulled into the jsdom test runner with vm.runInThisContext()).
 *
 * Do NOT add anything here that depends on chrome.* or browser.* extension
 * APIs — this stays a plain-DOM-API file so the IndexedDB round-trip is
 * directly testable under JSDOM + fake-indexeddb (see test/run-jsdom.js),
 * with no chrome/browser mocking required. Same rule as src/vaultHandle.js,
 * which owns its own separate database ('inkpour-vault') for the
 * FileSystemDirectoryHandle — the two never share a DB.
 */

const ARCHIVE_DB_NAME    = 'inkpour-archive';
const ARCHIVE_DB_VERSION = 1;
const ARCHIVE_STORE_NAME = 'exports';

function _openArchiveDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ARCHIVE_DB_NAME, ARCHIVE_DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(ARCHIVE_STORE_NAME)) {
        const store = req.result.createObjectStore(ARCHIVE_STORE_NAME, { keyPath: 'id' });
        store.createIndex('exportedAt', 'exportedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Mirror one export record into the archive. `record` is the same shape
 * saveLastExport() writes to inkpour_history ({ id, title, platform, slug,
 * sourceUrl, format, messageCount, wordCount, exportedAt, content, ... }).
 * put() semantics: a record with an already-archived id replaces that entry
 * (same collision behavior the storage.local list has for same-ms ids).
 */
async function archiveAddExport(record) {
  if (!record || typeof record !== 'object' || !record.id) {
    throw new Error('archiveAddExport: record with an id is required');
  }
  const db = await _openArchiveDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(ARCHIVE_STORE_NAME, 'readwrite');
      tx.objectStore(ARCHIVE_STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** All archived exports, newest first (by exportedAt, falling back to id). */
async function archiveGetAllExports() {
  const db = await _openArchiveDb();
  try {
    const entries = await new Promise((resolve, reject) => {
      const tx  = db.transaction(ARCHIVE_STORE_NAME, 'readonly');
      const req = tx.objectStore(ARCHIVE_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror   = () => reject(req.error);
    });
    return entries.sort((a, b) => {
      const ta = a.exportedAt || '';
      const tb = b.exportedAt || '';
      if (ta !== tb) return ta < tb ? 1 : -1;
      return String(b.id).localeCompare(String(a.id));
    });
  } finally {
    db.close();
  }
}

/** Number of archived exports. */
async function archiveCountExports() {
  const db = await _openArchiveDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(ARCHIVE_STORE_NAME, 'readonly');
      const req = tx.objectStore(ARCHIVE_STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Delete one archived export by id (no-op if the id isn't archived). */
async function archiveDeleteExport(id) {
  const db = await _openArchiveDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(ARCHIVE_STORE_NAME, 'readwrite');
      tx.objectStore(ARCHIVE_STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Delete every archived export (the History page's "Clear archive" button). */
async function archiveClearExports() {
  const db = await _openArchiveDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(ARCHIVE_STORE_NAME, 'readwrite');
      tx.objectStore(ARCHIVE_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
