/**
 * exporters/json.js
 * Structured JSON export.
 * No browser.* API calls.
 */

export function buildJSON(messages) {
  return JSON.stringify({
    title:    document.title,
    url:      location.href,
    exported: new Date().toISOString(),
    messages,
  }, null, 2);
}
