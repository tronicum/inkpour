/**
 * browser/index.js
 * Browser detection and unified capability API.
 * This is the ONLY place that should fingerprint the runtime.
 */

export const api = (typeof browser !== 'undefined') ? browser : chrome;

/**
 * Detect which browser family we're running in.
 * Returns one of: 'firefox' | 'chrome' | 'edge' | 'safari' | 'unknown'
 *
 * Uses feature detection first, UA string as fallback.
 * Never asks the user — auto-detect is always better.
 */
export function detectBrowser() {
  // Firefox is the only browser that exposes browser.runtime.getBrowserInfo
  if (typeof browser !== 'undefined' && typeof browser.runtime.getBrowserInfo === 'function') {
    return 'firefox';
  }
  const ua = navigator.userAgent;
  // Edge declares itself before Chrome in the UA
  if (ua.includes('Edg/'))    return 'edge';
  // Brave exposes navigator.brave
  if (navigator.brave?.isBrave) return 'chrome'; // Chrome-compatible
  if (ua.includes('Chrome/')) return 'chrome';
  if (ua.includes('Safari/')) return 'safari';
  return 'unknown';
}

export function getCapabilities() {
  const b = detectBrowser();
  return {
    browser: b,
    // Firefox has native tabs.printToPDF — useful for future silent-save PDF
    hasPrintToPDF: b === 'firefox' && typeof api.tabs?.printToPDF === 'function',
  };
}
