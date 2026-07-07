// @ts-check
const { defineConfig } = require('@playwright/test');
const path = require('path');

const extensionPath = path.resolve(__dirname);

module.exports = defineConfig({
  testDir: './test',
  timeout:  30_000,
  retries:  process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  projects: [
    // ── Chrome (covers Chrome, Edge, Brave) ──────────────────────────────────
    {
      name: 'chrome',
      testMatch: /test\/(e2e|unit)\/.+\.spec\.js/,
      use: {
        // launchPersistentContext is set up in the fixture helper; these args
        // are passed through from the helper for documentation purposes.
        // Actual context creation is in test/helpers/extension.js
        _extensionArgs: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
        ],
        // No channel:'chrome' — use Playwright's bundled Chromium (works in CI without a real Chrome install)
      },
    },

    // ── Firefox ──────────────────────────────────────────────────────────────
    // Firefox extension support in Playwright is limited — popup UI tests only.
    // Extraction tests are Chromium-only (content script injection works there).
    {
      name: 'firefox',
      testMatch: /test\/e2e\/popup\.spec\.js/,
      use: {
        browserName: 'firefox',
      },
    },

    // ── Safari / WebKit ───────────────────────────────────────────────────────
    // WebKit in Playwright does NOT support browser extensions.
    // Real Safari extension testing requires macOS + Xcode conversion.
    // See planning.md → Safari section for the roadmap.
  ],
});
