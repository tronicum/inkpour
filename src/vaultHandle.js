/**
 * src/vaultHandle.js — Direct-to-vault (File System Access API) persistence
 *
 * Loaded by settings.html and popup.html via <script> (same convention as
 * src/utils.js / src/redact.js — plain global functions, no import/export
 * syntax, so it works directly as a page <script> and can be pulled into the
 * jsdom test runner with vm.runInThisContext()).
 *
 * Chrome/Edge only. Callers MUST feature-detect `'showDirectoryPicker' in
 * window` before touching any of this — Firefox and Safari don't implement
 * the File System Access API at all, and this file assumes a
 * FileSystemDirectoryHandle-shaped object is passed in where one is expected.
 *
 * Why IndexedDB: a FileSystemDirectoryHandle is structured-cloneable and CAN
 * be stored in IndexedDB. It CANNOT be stored in chrome.storage.local, which
 * only round-trips JSON. This file owns one dedicated IndexedDB database (see
 * VAULT_DB_NAME below) so the rest of the extension never has to touch
 * IndexedDB directly — it just calls getVaultHandle() / setVaultHandle() /
 * clearVaultHandle().
 *
 * Do NOT add anything here that depends on chrome.* or browser.* extension
 * APIs — this stays a plain-DOM-API file so the IndexedDB round-trip and the
 * permission decision logic are directly testable under JSDOM + fake-indexeddb
 * (see test/run-jsdom.js), with no chrome/browser mocking required.
 */

const VAULT_DB_NAME    = 'inkpour-vault';
const VAULT_DB_VERSION = 1;
const VAULT_STORE_NAME = 'handles';
const VAULT_HANDLE_KEY = 'directoryHandle';

function _openVaultDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VAULT_DB_NAME, VAULT_DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(VAULT_STORE_NAME)) {
        req.result.createObjectStore(VAULT_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Resolve the persisted directory handle, or null if none has been chosen yet. */
async function getVaultHandle() {
  const db = await _openVaultDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(VAULT_STORE_NAME, 'readonly');
      const req = tx.objectStore(VAULT_STORE_NAME).get(VAULT_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Persist a chosen FileSystemDirectoryHandle so it survives popup/page reloads. */
async function setVaultHandle(handle) {
  const db = await _openVaultDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(VAULT_STORE_NAME, 'readwrite');
      tx.objectStore(VAULT_STORE_NAME).put(handle, VAULT_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Forget the persisted handle (e.g. the Settings page's "Forget folder" button). */
async function clearVaultHandle() {
  const db = await _openVaultDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(VAULT_STORE_NAME, 'readwrite');
      tx.objectStore(VAULT_STORE_NAME).delete(VAULT_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// ─── Permission handling ───────────────────────────────────────────────────
// Handles don't retain write permission across browser restarts:
// queryPermission() can come back 'prompt' (or 'denied') even for a handle
// that had readwrite granted last session. shouldRequestPermission() is
// factored out as its own pure function purely so this decision is
// unit-testable without a real FileSystemHandle object — JSDOM/Node have no
// such thing, but a plain string in/boolean out function needs nothing else.

function shouldRequestPermission(queryResult) {
  return queryResult !== 'granted';
}

/**
 * Resolve read-write permission for a directory handle, requesting it if
 * necessary. MUST be called as the very first thing inside a user-gesture
 * click handler (before any other `await`) — requestPermission() needs the
 * "transient activation" the click just created, and intervening awaits
 * (message-passing to a content script, network calls, etc.) can consume
 * that activation before this ever runs, causing it to silently reject.
 * Returns true if the handle is writable, false if permission was denied.
 */
async function ensureReadWritePermission(dirHandle) {
  const query = await dirHandle.queryPermission({ mode: 'readwrite' });
  if (!shouldRequestPermission(query)) return true;
  const requested = await dirHandle.requestPermission({ mode: 'readwrite' });
  return requested === 'granted';
}

/**
 * Write a text payload to `filename` inside the vault directory, creating
 * the file if it doesn't exist yet (overwrites if it does).
 *
 * Not unit-testable under JSDOM — there is no real FileSystemFileHandle /
 * FileSystemWritableFileStream implementation to run this against — but it's
 * a thin, direct wrapper around the three documented File System Access
 * calls, so there's little logic here to get wrong independently of that.
 */
async function writeFileToVault(dirHandle, filename, contents) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable   = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}
