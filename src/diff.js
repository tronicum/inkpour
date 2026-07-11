/**
 * src/diff.js — Inkpour
 *
 * Helper for incremental re-exports: when a conversation the user already
 * exported has grown with new turns, we want to export only the messages
 * added since that prior export.
 *
 * IMPORTANT CONSTRAINT: Inkpour's export history (see `saveLastExport` in
 * popup.js) only stores a rendered `content` string and an integer
 * `messageCount` for each past export — it does NOT store the raw
 * `{ role, content }` messages array that produced it. So there is nothing
 * to diff against message-by-message; the only thing we can do is assume
 * conversations grow by strictly *appending* new turns at the end, and slice
 * the current messages array at the previous count.
 *
 * ASSUMPTION: every supported platform (ChatGPT, Claude, Gemini, etc.) only
 * lets a conversation grow by appending new turns — none of them expose a
 * way to delete or reorder earlier turns in a way this extension would
 * observe on re-extraction. If that assumption ever breaks for some
 * platform, this slice-by-count approach would need to be replaced with a
 * real diff (e.g. hashing message content), but for now it holds for all
 * supported platforms.
 */

(function (root) {
  'use strict';

  /**
   * Return only the messages that were added after a previous export.
   *
   * @param {Array<{role: string, content: string}>} currentMessages - full,
   *   freshly-extracted messages array for the conversation right now.
   * @param {number} previousMessageCount - `messageCount` recorded on the
   *   most recent matching history entry for this conversation's URL.
   * @returns {Array<{role: string, content: string}>} the "new" messages,
   *   i.e. everything appended since the previous export. Returns the full
   *   array unchanged if `previousMessageCount` isn't usable (not a
   *   positive number), and an empty array if the conversation hasn't
   *   grown (or has fewer messages than before, e.g. a fresh/different
   *   chat re-using the same URL).
   */
  function sliceNewMessages(currentMessages, previousMessageCount) {
    if (!Array.isArray(currentMessages)) return [];
    if (typeof previousMessageCount !== 'number' || previousMessageCount <= 0) {
      return currentMessages;
    }
    if (previousMessageCount >= currentMessages.length) return [];
    return currentMessages.slice(previousMessageCount);
  }

  const api = { sliceNewMessages };

  // Support both browser <script> usage (popup.html) and CommonJS (tests/tools).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.InkpourDiff = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
