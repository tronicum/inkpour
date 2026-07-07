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
      // headless=new supports extensions in Chromium 112+
      headless: true,
      args: [
        '--headless=new',
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
