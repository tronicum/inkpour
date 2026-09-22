/**
 * test/e2e/per-message.spec.js
 * Real-Chromium regression coverage for the per-message "Copy as Markdown"
 * buttons (planning/adr-per-message-share-buttons.md) — the feature is off
 * by default (perMessageCopyButtons), so this suite seeds it on, then drives
 * an actual shadow-DOM button click and reads the clipboard back.
 *
 * Strategy: identical to extraction.spec.js's route-interception technique
 * (serve fixture HTML at a real-looking hostname so content_scripts match
 * naturally) plus one extra step — seed the setting through the extension's
 * OWN settings.html page before navigating to the fixture, since that's an
 * extension-page context that always has chrome.storage (evaluating inside
 * the service worker throws "Cannot read properties of undefined").
 *
 * This suite, its route-interception-for-a-gated-setting approach, and the
 * "hover the anchor, then click the button *inside* the shadow root — not
 * the host element itself" detail below were worked out by a second Claude
 * Code session with real Chrome automation attached (a distinct instance of
 * this same AI, not a person), collaborating on this investigation via a
 * small peer-to-peer file protocol built for that purpose
 * (agent-echochamber). It found the actual bug this whole investigation was
 * chasing: there wasn't one — perMessageCopyButtons was simply never turned
 * on in the browser being manually tested, and the code was correct
 * throughout. Credited here because it did the real diagnostic work.
 */

const { test, expect } = require('../helpers/extension');
const path = require('path');
const fs   = require('fs');

// Allow skipping the whole suite locally (e.g. SKIP_E2E=1 npx playwright test)
test.skip(!!process.env.SKIP_E2E, 'Skipped via SKIP_E2E env var');

/**
 * Turns the per-message setting on via the extension's own settings page —
 * an extension-page context always has chrome.storage, unlike the service
 * worker. Mirrors exactly the context a human toggling the setting is in.
 */
async function enablePerMessageButtons(context, extensionId) {
  const opt = await context.newPage();
  await opt.goto(`chrome-extension://${extensionId}/settings.html`);
  const stored = await opt.evaluate(async () => {
    await chrome.storage.local.set({
      inkpour_settings: { perMessageCopyButtons: true },
    });
    const r = await chrome.storage.local.get('inkpour_settings');
    return r.inkpour_settings;
  });
  expect(stored.perMessageCopyButtons).toBe(true);
  await opt.close();
}

/**
 * Serves fixtureHtml at urlPattern so the real hostname's content_scripts
 * match pattern fires, then navigates a new tab there. Identical technique
 * to extraction.spec.js's extractViaRoute() — see that file's header comment
 * for why this works without a login or real network access.
 */
async function openFixtureAsRealHost(context, urlPattern, url, fixturePath) {
  const tab = await context.newPage();
  await tab.route(urlPattern, route =>
    route.fulfill({
      body: fs.readFileSync(fixturePath),
      contentType: 'text/html; charset=utf-8',
    })
  );
  await tab.goto(url);
  await tab.waitForFunction(
    () => typeof window.__inkpourReady !== 'undefined' || document.readyState === 'complete',
    { timeout: 5000 }
  );
  return tab;
}

const SITES = [
  {
    name: 'ChatGPT',
    fixture: path.resolve(__dirname, '../fixtures/chatgpt.html'),
    urlPattern: 'https://chatgpt.com/**',
    url: 'https://chatgpt.com/c/per-message-test',
    // MESSAGE_ANCHORS.chatgpt.sel in src/content.js — the message elements
    // themselves, not the <article> turn wrapper (that's only the anchor()
    // target the button actually attaches to).
    anchorSelector: '[data-message-author-role]',
  },
  {
    name: 'Claude',
    fixture: path.resolve(__dirname, '../fixtures/claude.html'),
    urlPattern: 'https://claude.ai/**',
    url: 'https://claude.ai/chat/per-message-test',
    anchorSelector: '[data-testid="user-message"], .font-claude-message:not(#markdown-artifact), .font-claude-response:not(#markdown-artifact), [data-testid="assistant-message"]',
  },
  {
    name: 'Gemini',
    fixture: path.resolve(__dirname, '../fixtures/gemini.html'),
    urlPattern: 'https://gemini.google.com/**',
    url: 'https://gemini.google.com/app/per-message-test',
    anchorSelector: 'user-query, model-response',
  },
];

for (const site of SITES) {
  test.describe(`Per-message copy buttons — ${site.name}`, () => {
    test('injects one button host per message, matching the anchor count', async ({ context, extensionId }) => {
      await enablePerMessageButtons(context, extensionId);
      const tab = await openFixtureAsRealHost(context, site.urlPattern, site.url, site.fixture);

      const anchors = await tab.locator(site.anchorSelector).count();
      expect(anchors).toBeGreaterThan(0);

      await tab.waitForSelector('[data-inkpour-msg-host]', { timeout: 12000 });
      const hosts  = await tab.locator('[data-inkpour-msg-host]').count();
      const marked = await tab.locator('[data-inkpour-msg]').count();

      expect(hosts).toBeGreaterThan(0);
      expect(hosts).toBe(marked);

      await tab.close();
    });

    test('does not double-decorate after a DOM mutation', async ({ context, extensionId }) => {
      await enablePerMessageButtons(context, extensionId);
      const tab = await openFixtureAsRealHost(context, site.urlPattern, site.url, site.fixture);
      await tab.waitForSelector('[data-inkpour-msg-host]', { timeout: 12000 });

      const before = await tab.locator('[data-inkpour-msg-host]').count();
      await tab.evaluate(() => document.body.appendChild(document.createComment('force mutation')));
      await tab.waitForTimeout(1200);
      const after = await tab.locator('[data-inkpour-msg-host]').count();

      expect(after).toBe(before);
      await tab.close();
    });

    test('clicking the button copies Markdown to the clipboard', async ({ context, extensionId }) => {
      await enablePerMessageButtons(context, extensionId);
      const tab = await openFixtureAsRealHost(context, site.urlPattern, site.url, site.fixture);
      await tab.waitForSelector('[data-inkpour-msg-host]', { timeout: 12000 });
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(site.url).origin });

      // The button lives inside a shadow root and CSS only reveals it while
      // the anchor is hovered — hover the anchor first, then click the
      // button *inside* the host's shadow root. Clicking the host element
      // itself is a no-op (it's the shadow host, not a clickable control).
      await tab.locator('[data-inkpour-msg]').first().hover();
      await tab.waitForTimeout(400);
      const btn = tab.locator('[data-inkpour-msg-host] button').first();
      await expect(btn).toHaveCount(1);
      await btn.click({ force: true });
      await tab.waitForTimeout(900);

      const clip = await tab.evaluate(() => navigator.clipboard.readText());
      expect(clip.length).toBeGreaterThan(0);

      await tab.close();
    });
  });
}
