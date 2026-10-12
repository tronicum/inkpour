/**
 * test/helpers/extension.js
 * Shared fixture that loads the Inkpour extension in a Chromium persistent
 * context and provides the extension ID for navigating to extension pages.
 *
 * Usage:
 *   const { test, expect } = require('./extension');
 *   test('...', async ({ context, extensionId, popupPage }) => { ... });
 */

const { test: base, expect, chromium } = require('@playwright/test');
const path = require('path');
const os   = require('os');
const fs   = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '../..');

exports.expect = expect;

exports.test = base.extend({
  // Persistent browser context with the extension loaded
  context: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkpour-pw-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      // channel:'chromium' is LOAD-BEARING, not cosmetic. Since Playwright
      // 1.49, a plain `headless: true` chromium launch does NOT start the
      // full Chromium binary — it starts the separate `chromium_headless_shell`
      // build, which has no extensions subsystem at all. It silently ignores
      // --load-extension, so no extension service worker ever registers and
      // the `extensionId` fixture below hangs until the test times out with
      // "Test timeout of 30000ms exceeded while setting up 'extensionId'".
      // That is exactly what every browser-backed e2e test did in CI once the
      // resolved @playwright/test crossed 1.49 (^1.45.0 → 1.61.1 in the
      // lockfile). `channel: 'chromium'` forces the real Chromium binary in
      // new-headless mode, which does support extensions.
      channel: 'chromium',
      headless: true,
      args: [
        // No '--headless=new' here: channel:'chromium' + headless:true is
        // already new headless, and passing the flag by hand did nothing to
        // steer the headless-shell launch away from the shell binary.
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  },

  // The unpacked extension's ID (derived from the service worker URL)
  extensionId: async ({ context }, use) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const id = new URL(sw.url()).hostname;
    await use(id);
  },

  // A pre-opened popup page (chrome-extension://<id>/popup.html)
  popupPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await use(page);
  },
});
