/**
 * test/e2e/extraction.spec.js
 * Tests message extraction against fixture HTML pages.
 *
 * Strategy: inject content.js into the fixture page with a mocked chrome API
 * so the IIFE registers its onMessage listener against our mock. We then call
 * the listener directly and await the returned Promise — no real extension
 * message passing needed.
 */

const { test, expect } = require('../helpers/extension');
const path = require('path');
const fs   = require('fs');

const CONTENT_JS = fs.readFileSync(
  path.resolve(__dirname, '../../src/content.js'), 'utf8'
);

/**
 * Injects content.js into a page with a mocked chrome/browser API,
 * triggers { action: 'extract' }, and returns the response.
 */
async function extractFromFixture(page, fixturePath) {
  await page.goto('about:blank');

  // 1. Set up the mock API before content.js loads so `api` resolves to it
  await page.evaluate(() => {
    const listeners = [];
    window.__mockListeners = listeners;
    const mockRuntime = {
      onMessage: { addListener: fn => listeners.push(fn) },
      id: 'test-extension-id',
    };
    // content.js picks browser over chrome — mock both
    window.browser = { runtime: mockRuntime };
    window.chrome  = { runtime: mockRuntime };
  });

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

test.describe('ChatGPT extraction', () => {
  const fixture = path.resolve(__dirname, '../fixtures/chatgpt.html');

  test('extracts correct number of messages', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture);
    expect(result.messages).toHaveLength(4);
  });

  test('alternates user / assistant roles', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture);
    expect(result.messages[0].role).toBe('You');
    expect(result.messages[1].role).toBe('ChatGPT');
    expect(result.messages[2].role).toBe('You');
    expect(result.messages[3].role).toBe('ChatGPT');
  });

  test('preserves emoji in user message', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture);
    expect(result.messages[0].content).toContain('🚀');
  });

  test('converts bold to markdown', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture);
    expect(result.messages[1].content).toContain('**299,792,458 m/s**');
  });

  test('converts code block with language tag', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture);
    expect(result.messages[1].content).toContain('```python');
    expect(result.messages[1].content).toContain('SPEED_OF_LIGHT');
  });

  test('returns site and filename', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture);
    expect(result.filename).toBeTruthy();
    expect(result.title).toBeTruthy();
  });
});

test.describe('Claude extraction', () => {
  const fixture = path.resolve(__dirname, '../fixtures/claude.html');

  test('extracts 4 messages in DOM order', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('You');
    expect(result.messages[1].role).toBe('Claude');
  });

  test('converts unordered list to markdown', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture);
    const assistantMsg = result.messages[3].content;
    expect(assistantMsg).toContain('* **Stack overflow**');
  });

  test('preserves thinking emoji', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture);
    expect(result.messages[0].content).toContain('🤔');
  });
});

test.describe('Gemini extraction', () => {
  const fixture = path.resolve(__dirname, '../fixtures/gemini.html');

  test('extracts from user-query and model-response elements', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('You');
    expect(result.messages[1].role).toBe('Gemini');
  });

  test('preserves checkmark emoji', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture);
    expect(result.messages[0].content).toContain('✅');
  });

  test('converts code block in model response', async ({ context }) => {
    const page = await context.newPage();
    const result = await extractFromFixture(page, fixture);
    expect(result.messages[3].content).toContain('```javascript');
  });
});

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
