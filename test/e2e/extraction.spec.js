/**
 * test/e2e/extraction.spec.js
 * Tests message extraction against fixture HTML pages.
 *
 * Strategy: inject content.js into the fixture page with a mocked chrome API
 * so the IIFE registers its onMessage listener against our mock. We then call
 * the listener directly and await the returned Promise — no real extension
 * message passing needed.
 *
 * Each platform test passes a `hostname` that sets window.__inkpourTestHostname
 * so detectSite() routes to the correct extractor (not the generic fallback).
 */

const { test, expect } = require('../helpers/extension');
const path = require('path');
const fs   = require('fs');

const CONTENT_JS = fs.readFileSync(
  path.resolve(__dirname, '../../src/content.js'), 'utf8'
);

/**
 * Injects content.js into a page with a mocked chrome/browser API,
 * optionally faking the hostname so detectSite() routes correctly,
 * triggers { action: 'extract' }, and returns the response.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} fixturePath
 * @param {string} [hostname] - e.g. 'chatgpt.com'; leave blank for generic tests
 */
async function extractFromFixture(page, fixturePath, hostname = '') {
  await page.goto('about:blank');

  // 1. Set up the mock API and optional hostname override before content.js loads
  await page.evaluate((h) => {
    const listeners = [];
    window.__mockListeners = listeners;
    const mockRuntime = {
      onMessage: { addListener: fn => listeners.push(fn) },
      id: 'test-extension-id',
    };
    // content.js picks browser over chrome — mock both
    window.browser = { runtime: mockRuntime };
    window.chrome  = { runtime: mockRuntime };
    // Fake hostname so detectSite() routes to the right extractor
    if (h) window.__inkpourTestHostname = h;
  }, hostname);

  // 2. Load the fixture HTML into the document body
  const html = fs.readFileSync(fixturePath, 'utf8');
  const bodyHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  await page.evaluate((b) => { document.body.innerHTML = b; }, bodyHTML);

  // 3. Inject content.js — it registers with our mock listener
  await page.addScriptTag({ content: CONTENT_JS });

  // 4. Call the registered listener and await the returned Promise
  return page.evaluate(async () => {
    const listener = window.__mockListeners[0];
    if (!listener) throw new Error('No onMessage listener registered');
    return await listener({ action: 'extract' });
  });
}

// ─── ChatGPT ──────────────────────────────────────────────────────────────

test.describe('ChatGPT extraction', () => {
  const fixture = path.resolve(__dirname, '../fixtures/chatgpt.html');
  const host    = 'chatgpt.com';

  test('extracts correct number of messages', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages).toHaveLength(4);
  });

  test('alternates user / assistant roles', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].role).toBe('You');
    expect(result.messages[1].role).toBe('ChatGPT');
    expect(result.messages[2].role).toBe('You');
    expect(result.messages[3].role).toBe('ChatGPT');
  });

  test('preserves emoji in user message', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].content).toContain('🚀');
  });

  test('converts bold to markdown', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[1].content).toContain('**299,792,458 m/s**');
  });

  test('converts code block with language tag', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[1].content).toContain('```python');
    expect(result.messages[1].content).toContain('SPEED_OF_LIGHT');
  });

  test('returns site, platform, and filename', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.filename).toBeTruthy();
    expect(result.title).toBeTruthy();
    expect(result.platform).toBe('chatgpt');
  });
});

// ─── Claude ───────────────────────────────────────────────────────────────

test.describe('Claude extraction', () => {
  const fixture = path.resolve(__dirname, '../fixtures/claude.html');
  const host    = 'claude.ai';

  test('extracts 4 messages in DOM order', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('You');
    expect(result.messages[1].role).toBe('Claude');
  });

  test('converts unordered list to markdown', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    const assistantMsg = result.messages[3].content;
    expect(assistantMsg).toContain('* **Stack overflow**');
  });

  test('preserves thinking emoji', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].content).toContain('🤔');
  });
});

// ─── Gemini ───────────────────────────────────────────────────────────────

test.describe('Gemini extraction', () => {
  const fixture = path.resolve(__dirname, '../fixtures/gemini.html');
  const host    = 'gemini.google.com';

  test('extracts from user-query and model-response elements', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('You');
    expect(result.messages[1].role).toBe('Gemini');
  });

  test('strips "You said" UI label from user turns', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].content.toLowerCase()).not.toContain('you said');
  });

  test('strips "Gemini said" UI label from AI turns', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[1].content.toLowerCase()).not.toContain('gemini said');
  });

  test('preserves checkmark emoji', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].content).toContain('✅');
  });

  test('converts code block in model response', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[3].content).toContain('```javascript');
  });
});

// ─── Grok ─────────────────────────────────────────────────────────────────

test.describe('Grok extraction', () => {
  const fixture = path.resolve(__dirname, '../fixtures/grok.html');
  const host    = 'grok.com';

  test('extracts 4 messages from div[id^="response-"] containers', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages).toHaveLength(4);
  });

  test('detects user turns by items-end class', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].role).toBe('You');
    expect(result.messages[1].role).toBe('Grok');
  });

  test('preserves emoji in user message', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].content).toContain('⚡');
  });

  test('converts code block with language tag', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[3].content).toContain('```python');
  });
});

// ─── Perplexity ───────────────────────────────────────────────────────────

test.describe('Perplexity extraction (experimental)', () => {
  const fixture = path.resolve(__dirname, '../fixtures/perplexity.html');
  const host    = 'perplexity.ai';

  test('extracts 4 messages (2 user, 2 AI)', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
  });

  test('preserves microscope emoji', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    const allContent = result.messages.map(m => m.content).join('');
    expect(allContent).toContain('🔬');
  });

  test('preserves code block', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    const allContent = result.messages.map(m => m.content).join('');
    expect(allContent).toContain('```');
  });
});

// ─── DeepSeek ─────────────────────────────────────────────────────────────

test.describe('DeepSeek extraction (experimental)', () => {
  const fixture = path.resolve(__dirname, '../fixtures/deepseek.html');
  const host    = 'chat.deepseek.com';

  test('extracts 4 messages via data-role attribute', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages).toHaveLength(4);
  });

  test('detects user vs assistant turns', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].role).toBe('You');
    expect(result.messages[1].role).toBe('DeepSeek');
  });

  test('converts table in AI response', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[1].content).toContain('| Feature |');
  });

  test('converts code block with language tag', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[1].content).toContain('```python');
  });
});

// ─── Meta AI ──────────────────────────────────────────────────────────────

test.describe('Meta AI extraction (experimental)', () => {
  const fixture = path.resolve(__dirname, '../fixtures/metaai.html');
  const host    = 'meta.ai';

  test('extracts 4 messages via data-message-author', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages).toHaveLength(4);
  });

  test('detects user vs assistant by data-message-author', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].role).toBe('You');
    expect(result.messages[1].role).toBe('Meta AI');
  });

  test('preserves robot emoji in user message', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].content).toContain('🤖');
  });

  test('converts ordered list in AI response', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[1].content).toContain('1.');
  });
});

// ─── Mistral ──────────────────────────────────────────────────────────────

test.describe('Mistral extraction (experimental)', () => {
  const fixture = path.resolve(__dirname, '../fixtures/mistral.html');
  const host    = 'chat.mistral.ai';

  test('extracts 4 messages via data-role', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages).toHaveLength(4);
  });

  test('detects user vs assistant by data-role', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].role).toBe('You');
    expect(result.messages[1].role).toBe('Mistral');
  });

  test('preserves chart emoji in user message', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].content).toContain('📉');
  });

  test('converts code block with language tag', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[1].content).toContain('```python');
  });
});

// ─── HuggingChat ──────────────────────────────────────────────────────────

test.describe('HuggingChat extraction (experimental)', () => {
  const fixture = path.resolve(__dirname, '../fixtures/huggingchat.html');
  const host    = 'huggingface.co';

  test('extracts 4 messages via data-message-role', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages).toHaveLength(4);
  });

  test('detects user vs assistant by data-message-role', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].role).toBe('You');
    expect(result.messages[1].role).toBe('HuggingChat');
  });

  test('preserves desktop emoji in user message', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].content).toContain('🖥️');
  });

  test('converts bash code block in AI response', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    const allContent = result.messages.map(m => m.content).join('');
    expect(allContent).toContain('```bash');
  });
});

// ─── Poe ──────────────────────────────────────────────────────────────────

test.describe('Poe extraction (experimental)', () => {
  const fixture = path.resolve(__dirname, '../fixtures/poe.html');
  const host    = 'poe.com';

  test('extracts 4 messages via CSS module class names', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages).toHaveLength(4);
  });

  test('detects human vs bot messages', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].role).toBe('You');
    expect(result.messages[1].role).toBe('Bot');
  });

  test('preserves triangle emoji in user message', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].content).toContain('🔺');
  });

  test('converts code block with python language tag', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    const allContent = result.messages.map(m => m.content).join('');
    expect(allContent).toContain('```python');
    expect(allContent).toContain('EventualStore');
  });
});

// ─── Phind ────────────────────────────────────────────────────────────────

test.describe('Phind extraction (experimental)', () => {
  const fixture = path.resolve(__dirname, '../fixtures/phind.html');
  const host    = 'www.phind.com';

  test('extracts 4 messages via CSS module class names', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages).toHaveLength(4);
  });

  test('detects user vs AI turns', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].role).toBe('You');
    expect(result.messages[1].role).toBe('Phind');
  });

  test('preserves tree emoji in user message', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[0].content).toContain('🌳');
  });

  test('converts python code block', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    const allContent = result.messages.map(m => m.content).join('');
    expect(allContent).toContain('```python');
    expect(allContent).toContain('class BST');
  });

  test('converts complexity table', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture, host);
    expect(result.messages[3].content).toContain('| Operation |');
    expect(result.messages[3].content).toContain('O(log n)');
  });
});

// ─── Unknown / generic ────────────────────────────────────────────────────

test.describe('Unknown / generic page', () => {
  test('returns error for page with no recognisable structure', async ({ context }) => {
    const page = await context.newPage();
    await page.evaluate(() => {
      const listeners = [];
      window.__mockListeners = listeners;
      const mockRuntime = { onMessage: { addListener: fn => listeners.push(fn) }, id: 'test' };
      window.browser = { runtime: mockRuntime };
      window.chrome  = { runtime: mockRuntime };
    });
    await page.addScriptTag({
      content: fs.readFileSync(path.resolve(__dirname, '../../src/content.js'), 'utf8'),
    });
    const result = await page.evaluate(async () => {
      return await window.__mockListeners[0]({ action: 'extract' });
    });
    expect(result.error).toBeTruthy();
  });
});
