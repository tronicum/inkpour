// @ts-check
const { defineConfig } = require('@playwright/test');
const path = require('path');

const extensionPath = path.resolve(__dirname);

module.exports = defineConfig({
  testDir: './test',
  timeout:  30_000,
  retries:  process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Serial execution in CI. NOTE: this was originally added on the theory
  // that CPU contention between two parallel launchPersistentContext() calls
  // was starving extension service-worker startup past the 30s timeout. That
  // theory was DISPROVEN by run 37684854533 — with workers:1 ("Running 55
  // tests using 1 worker") the exact same 36 tests still failed, the very
  // first one cold. The real cause was that Playwright >=1.49 launches the
  // extension-less `chromium_headless_shell` binary for a plain
  // `headless: true` chromium launch; see test/helpers/extension.js, which
  // now pins channel:'chromium'. (The earlier read that "popup.spec.js
  // passed 19/19" was a miscount: the 19 passing tests were all of
  // markdown-output.spec.js, which never launches a browser. Every single
  // browser-backed test, popup.spec.js included, failed.)
  // workers:1 is kept anyway — these are heavy per-test browser launches and
  // serializing them on a 4-core hosted runner is cheap insurance.
  workers: process.env.CI ? 1 : undefined,

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

    // ── Orion (macOS) ────────────────────────────────────────────────────────
    // Kagi's WebKit-based browser — unlike Safari it runs Chrome/Firefox
    // extensions directly (its own WebExtensions implementation, ~70% API
    // coverage as of this writing), no Xcode conversion needed. But Orion
    // isn't a Playwright-automatable browser channel (it's not Chromium,
    // Firefox, or Playwright's own WebKit build — no CDP/automation hook),
    // so there's no project to add here. Verifying Inkpour in Orion means
    // manual testing on a real Mac: Settings → Advanced → enable "Allow
    // installation of 3rd party Chrome extensions", then Tools → Extensions
    // → Manage Extensions → Add Extension → load this folder. See
    // README.md → "Supported browsers" for the same instructions.
  ],
});
