/**
 * test/e2e/extraction.spec.js
 * Tests message extraction against fixture HTML pages.
 *
 * Strategy: use page.route() to serve fixture HTML at a real-looking URL so
 * the extension's content script injects naturally (matched by manifest
 * content_scripts). From a popup.html page we then call chrome.tabs.sendMessage
 * to trigger extraction and collect the result.
 *
 * Other platforms (Gemini, Grok, Perplexity, DeepSeek, Meta AI, Mistral,
 * HuggingChat, Poe, Phind) follow exactly the same pattern — swap out the
 * fixture path, URL, and assertions.
 */

const { test, expect } = require('../helpers/extension');
const path = require('path');
const fs   = require('fs');

// Allow skipping the whole suite locally (e.g. SKIP_E2E=1 npx playwright test)
test.skip(!!process.env.SKIP_E2E, 'Skipped via SKIP_E2E env var');

/**
 * Routes `urlPattern` to serve `fixturePath`, navigates a new tab to `url`,
 * waits for the content script to be ready, then sends { action: 'extract' }
 * from the extension popup context and returns the response.
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} extensionId
 * @param {string} urlPattern  - glob passed to page.route(), e.g. 'https://chatgpt.com/**'
 * @param {string} url         - exact URL to navigate to
 * @param {string} fixturePath - absolute path to the fixture HTML file
 * @returns {Promise<object>}  - extraction result
 */
async function extractViaRoute(context, extensionId, urlPattern, url, fixturePath) {
  // 1. Open the target tab and intercept the URL with fixture HTML
  const tab = await context.newPage();
  await tab.route(urlPattern, route =>
    route.fulfill({
      body: fs.readFileSync(fixturePath),
      contentType: 'text/html; charset=utf-8',
    })
  );
  await tab.goto(url);

  // 2. Wait for content script to be ready (or for page load to complete)
  await tab.waitForFunction(
    () => typeof window.__inkpourReady !== 'undefined' || document.readyState === 'complete',
    { timeout: 5000 }
  );

  // 3. Open popup.html in an extension context so chrome.tabs API is available
  const extPage = await context.newPage();
  await extPage.goto(`chrome-extension://${extensionId}/popup.html`);

  // 4. Query for the target tab from inside the extension context and send message
  const result = await extPage.evaluate(async (matchUrl) => {
    const tabs = await chrome.tabs.query({ url: matchUrl });
    if (!tabs.length) throw new Error('Tab not found for URL: ' + matchUrl);
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'extract' }, (r) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(r);
      });
    });
  }, urlPattern);

  await tab.close();
  await extPage.close();
  return result;
}

// ─── ChatGPT ──────────────────────────────────────────────────────────────

test.describe('ChatGPT extraction', () => {
  const fixture    = path.resolve(__dirname, '../fixtures/chatgpt.html');
  const urlPattern = 'https://chatgpt.com/**';
  const url        = 'https://chatgpt.com/c/test';

  test('extracts correct number of messages', async ({ context, extensionId }) => {
    const result = await extractViaRoute(context, extensionId, urlPattern, url, fixture);
    expect(result.messages).toHaveLength(4);
  });

  test('alternates user / assistant roles', async ({ context, extensionId }) => {
    const result = await extractViaRoute(context, extensionId, urlPattern, url, fixture);
    expect(result.messages[0].role).toBe('You');
    expect(result.messages[1].role).toBe('ChatGPT');
    expect(result.messages[2].role).toBe('You');
    expect(result.messages[3].role).toBe('ChatGPT');
  });

  test('preserves emoji in user message', async ({ context, extensionId }) => {
    const result = await extractViaRoute(context, extensionId, urlPattern, url, fixture);
    expect(result.messages[0].content).toContain('🚀');
  });

  test('converts bold to markdown', async ({ context, extensionId }) => {
    const result = await extractViaRoute(context, extensionId, urlPattern, url, fixture);
    expect(result.messages[1].content).toContain('**299,792,458 m/s**');
  });

  test('converts code block with language tag', async ({ context, extensionId }) => {
    const result = await extractViaRoute(context, extensionId, urlPattern, url, fixture);
    expect(result.messages[1].content).toContain('```python');
    expect(result.messages[1].content).toContain('SPEED_OF_LIGHT');
  });

  test('returns site, platform, and filename', async ({ context, extensionId }) => {
    const result = await extractViaRoute(context, extensionId, urlPattern, url, fixture);
    expect(result.filename).toBeTruthy();
    expect(result.title).toBeTruthy();
    expect(result.platform).toBe('chatgpt');
  });
});

// ─── Claude ───────────────────────────────────────────────────────────────

test.describe('Claude extraction', () => {
  const fixture    = path.resolve(__dirname, '../fixtures/claude.html');
  const urlPattern = 'https://claude.ai/**';
  const url        = 'https://claude.ai/chat/test';

  test('extracts 4 messages in DOM order', async ({ context, extensionId }) => {
    const result = await extractViaRoute(context, extensionId, urlPattern, url, fixture);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('You');
    expect(result.messages[1].role).toBe('Claude');
  });

  test('converts unordered list to markdown', async ({ context, extensionId }) => {
    const result = await extractViaRoute(context, extensionId, urlPattern, url, fixture);
    const assistantMsg = result.messages[3].content;
    expect(assistantMsg).toContain('* **Stack overflow**');
  });

  test('preserves thinking emoji', async ({ context, extensionId }) => {
    const result = await extractViaRoute(context, extensionId, urlPattern, url, fixture);
    expect(result.messages[0].content).toContain('🤔');
  });
});

// Other platforms (Gemini, Grok, Perplexity, DeepSeek, Meta AI, Mistral,
// HuggingChat, Poe, Phind, and any future additions) follow the same pattern:
//
//   const fixture    = path.resolve(__dirname, '../fixtures/<platform>.html');
//   const urlPattern = 'https://<host>/**';
//   const url        = 'https://<host>/some/path';
//   const result     = await extractViaRoute(context, extensionId, urlPattern, url, fixture);
//
// Then assert on result.messages, result.platform, etc.
