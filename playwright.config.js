// @ts-check
const { defineConfig } = require('@playwright/test');
const path = require('path');

const extensionPath = path.resolve(__dirname);

module.exports = defineConfig({
  testDir: './test',
  timeout:  30_000,
  retries:  process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Force serial execution in CI. Playwright's default worker count is half
  // the host's logical CPUs (2 on hosted ubuntu-latest's 4-core runners —
  // matches "Running 55 tests using 2 workers" in the 2026-10-05 scheduled
  // run log). Every test in extraction.spec.js/per-message.spec.js spins up
  // its OWN chromium.launchPersistentContext() with the real unpacked
  // extension loaded (test/helpers/extension.js), which starts a fresh
  // extension service worker each time. With workers:2, two of those heavy
  // launches can land on the runner's shared/throttled CPU at the same
  // moment, starving the service-worker startup past the 30s test timeout:
  // "Test timeout of 30000ms exceeded while setting up 'extensionId'" hit
  // every single test in both files (nothing file-specific — popup.spec.js
  // uses the identical fixture and passed 19/19), while the two failures in
  // that run landed within 0.4s of each other, consistent with simultaneous
  // contention rather than a bug in either spec file. workers:1 serializes
  // all persistent-context launches in CI so only one is ever starting up
  // at a time; local runs keep Playwright's normal parallel default.
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
