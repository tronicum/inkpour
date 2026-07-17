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
    // Removed 2026-07: Playwright's Firefox driver cannot load moz-extension://
    // pages at all (playwright/playwright#7297, closed as out-of-scope by a
    // maintainer — no code-level fix is possible). The `firefox` project that
    // used to live here was also silently broken independently of that: its
    // shared fixture (test/helpers/extension.js) hardcodes
    // chromium.launchPersistentContext(...) regardless of which project
    // selects it, so it was actually running Chromium under a Firefox label.
    // Real Firefox extension e2e testing would need Selenium+geckodriver or
    // raw WebDriver BiDi (`webExtension.install`, Firefox 138+) instead.
    // See planning/planning.md → Firefox testing section.

    // ── Safari / WebKit ───────────────────────────────────────────────────────
    // WebKit in Playwright does NOT support browser extensions.
    // Real Safari extension testing requires macOS + Xcode conversion.
    // See planning/planning.md → Safari section for the roadmap.
  ],
});
