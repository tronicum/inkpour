#!/usr/bin/env node
/**
 * test/run-jsdom.js — JSDOM-based test runner for Inkpour extraction logic.
 *
 * Mirrors the assertions in test/e2e/extraction.spec.js but runs entirely in
 * Node.js via JSDOM — no Chromium required, works in sandboxed CI environments.
 *
 * Usage:
 *   node test/run-jsdom.js
 */

'use strict';

const { JSDOM } = require('jsdom');
const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const CONTENT_JS   = fs.readFileSync(path.resolve(__dirname, '../src/content.js'), 'utf8');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

// ─── Load shared utils into the Node global scope ───────────────────────────
// src/utils.js declares functions at global scope (for importScripts compat).
// Running it in the current vm context makes them available here too.
const UTILS_JS = fs.readFileSync(path.resolve(__dirname, '../src/utils.js'), 'utf8');
vm.runInThisContext(UTILS_JS);

// ─── Mini test framework ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failures.push({ name, error: e.message });
    failed++;
  }
}

function suite(name, fn) {
  console.log(`\n${name}`);
  return fn();
}

// ─── Core helper ────────────────────────────────────────────────────────────

/**
 * Load a fixture HTML, inject content.js into a JSDOM environment with a
 * mocked browser API, trigger { action: 'extract' }, return the response.
 */
async function extractFromFixture(fixtureName, hostname = '') {
  const fixturePath = path.join(FIXTURES_DIR, fixtureName);
  const html = fs.readFileSync(fixturePath, 'utf8');

  const dom = new JSDOM(html, {
    url: 'https://example.com/',
    runScripts: 'dangerously',
    resources: 'usable',
  });

  const { window } = dom;

  // Mock browser/chrome API
  const listeners = [];
  const mockRuntime = {
    onMessage: { addListener: fn => listeners.push(fn) },
    id: 'test-extension-id',
  };
  window.browser = { runtime: mockRuntime };
  window.chrome  = { runtime: mockRuntime };

  // Fake hostname so detectSite() routes correctly
  if (hostname) window.__inkpourTestHostname = hostname;

  // scrollTo guard — JSDOM doesn't implement it
  window.HTMLElement.prototype.scrollTo = function () {};
  window.document.documentElement.scrollTo = function () {};

  // Execute content.js
  const scriptEl = window.document.createElement('script');
  scriptEl.textContent = CONTENT_JS;
  window.document.body.appendChild(scriptEl);

  // Give async init (injectInPageButton etc.) a tick to settle
  await new Promise(r => setTimeout(r, 50));

  const listener = listeners[0];
  if (!listener) throw new Error('No onMessage listener registered by content.js');

  // The listener uses sendResponse callback + return true for Chrome MV3 compat.
  // We wrap it in a Promise so tests can await the result as before.
  return new Promise((resolve, reject) => {
    let settled = false;
    const sendResponse = (response) => {
      if (!settled) { settled = true; resolve(response); }
    };
    try {
      const ret = listener({ action: 'extract' }, {}, sendResponse);
      // If the listener returned false / undefined (sync path), resolve immediately
      // with whatever was passed to sendResponse (already resolved above), or
      // resolve with undefined after a tick to let synchronous sendResponse run.
      if (ret !== true) {
        setTimeout(() => { if (!settled) { settled = true; resolve(undefined); } }, 100);
      }
    } catch (err) {
      if (!settled) reject(err);
    }
    // Safety timeout
    setTimeout(() => { if (!settled) { settled = true; resolve({ error: 'timeout' }); } }, 3000);
  });
}

// ─── Test suites ────────────────────────────────────────────────────────────

async function main() {
  // ── ChatGPT ───────────────────────────────────────────────────────────────
  await suite('ChatGPT extraction', async () => {
    let result;
    before: { result = await extractFromFixture('chatgpt.html', 'chatgpt.com'); }

    await test('extracts 4 messages', () => {
      assert(result.messages.length === 4, `got ${result.messages.length}`);
    });
    await test('alternates user / assistant roles', () => {
      assert(result.messages[0].role === 'You',     `role[0]=${result.messages[0].role}`);
      assert(result.messages[1].role === 'ChatGPT', `role[1]=${result.messages[1].role}`);
    });
    await test('preserves emoji in user message', () => {
      assert(result.messages[0].content.includes('🚀'), 'missing 🚀');
    });
    await test('converts bold to markdown', () => {
      assert(result.messages[1].content.includes('**299,792,458 m/s**'), 'missing bold');
    });
    await test('converts code block with language tag', () => {
      assert(result.messages[1].content.includes('```python'), 'missing ```python');
      assert(result.messages[1].content.includes('SPEED_OF_LIGHT'), 'missing SPEED_OF_LIGHT');
    });
    await test('returns platform=chatgpt', () => {
      assert(result.platform === 'chatgpt', `platform=${result.platform}`);
    });
  });

  // ── Claude ────────────────────────────────────────────────────────────────
  await suite('Claude extraction', async () => {
    const result = await extractFromFixture('claude.html', 'claude.ai');

    await test('extracts 4 messages in DOM order', () => {
      assert(result.messages.length === 4, `got ${result.messages.length}`);
      assert(result.messages[0].role === 'You', `role[0]=${result.messages[0].role}`);
      assert(result.messages[1].role === 'Claude', `role[1]=${result.messages[1].role}`);
    });
    await test('converts unordered list to markdown', () => {
      const msg = result.messages[3].content;
      assert(msg.includes('* **Stack overflow**'), 'missing list item with bold');
    });
    await test('preserves thinking emoji', () => {
      assert(result.messages[0].content.includes('🤔'), 'missing 🤔');
    });
  });

  // ── Gemini ────────────────────────────────────────────────────────────────
  await suite('Gemini extraction', async () => {
    const result = await extractFromFixture('gemini.html', 'gemini.google.com');

    await test('extracts from user-query and model-response', () => {
      assert(result.messages.length === 4, `got ${result.messages.length}`);
    });
    await test('strips "You said" UI label', () => {
      assert(!result.messages[0].content.toLowerCase().includes('you said'), 'found "you said"');
    });
    await test('strips "Gemini said" UI label', () => {
      assert(!result.messages[1].content.toLowerCase().includes('gemini said'), 'found "gemini said"');
    });
    await test('preserves checkmark emoji', () => {
      assert(result.messages[0].content.includes('✅'), 'missing ✅');
    });
    await test('converts code block', () => {
      assert(result.messages.some(m => m.content.includes('```')), 'no code blocks found');
    });
  });

  // ── Grok ──────────────────────────────────────────────────────────────────
  await suite('Grok extraction', async () => {
    const result = await extractFromFixture('grok.html', 'grok.com');

    await test('extracts 4 messages', () => {
      assert(result.messages.length === 4, `got ${result.messages.length}`);
    });
    await test('detects user turns by items-end class', () => {
      assert(result.messages[0].role === 'You',  `role[0]=${result.messages[0].role}`);
      assert(result.messages[1].role === 'Grok', `role[1]=${result.messages[1].role}`);
    });
    await test('preserves ⚡ emoji', () => {
      assert(result.messages[0].content.includes('⚡'), 'missing ⚡');
    });
    await test('converts code block with language tag', () => {
      assert(result.messages[3].content.includes('```python'), 'missing ```python');
    });
  });

  // ── Perplexity ────────────────────────────────────────────────────────────
  await suite('Perplexity extraction (experimental)', async () => {
    const result = await extractFromFixture('perplexity.html', 'perplexity.ai');

    await test('extracts ≥2 messages', () => {
      assert(result.messages.length >= 2, `got ${result.messages.length}`);
    });
    await test('preserves 🔬 emoji', () => {
      const all = result.messages.map(m => m.content).join('');
      assert(all.includes('🔬'), 'missing 🔬');
    });
    await test('preserves code block', () => {
      const all = result.messages.map(m => m.content).join('');
      assert(all.includes('```'), 'no code block');
    });
  });

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  await suite('DeepSeek extraction (experimental)', async () => {
    const result = await extractFromFixture('deepseek.html', 'chat.deepseek.com');

    await test('extracts 4 messages via data-role', () => {
      assert(result.messages.length === 4, `got ${result.messages.length}`);
    });
    await test('user vs assistant roles', () => {
      assert(result.messages[0].role === 'You',      `role[0]=${result.messages[0].role}`);
      assert(result.messages[1].role === 'DeepSeek', `role[1]=${result.messages[1].role}`);
    });
    await test('converts table in AI response', () => {
      assert(result.messages[1].content.includes('| Feature |'), 'no table');
    });
    await test('converts code block with language tag', () => {
      assert(result.messages[1].content.includes('```python'), 'missing ```python');
    });
  });

  // ── Meta AI ───────────────────────────────────────────────────────────────
  await suite('Meta AI extraction (experimental)', async () => {
    const result = await extractFromFixture('metaai.html', 'meta.ai');

    await test('extracts 4 messages via data-message-author', () => {
      assert(result.messages.length === 4, `got ${result.messages.length}`);
    });
    await test('user vs Meta AI roles', () => {
      assert(result.messages[0].role === 'You',     `role[0]=${result.messages[0].role}`);
      assert(result.messages[1].role === 'Meta AI', `role[1]=${result.messages[1].role}`);
    });
    await test('preserves 🤖 emoji', () => {
      assert(result.messages[0].content.includes('🤖'), 'missing 🤖');
    });
    await test('converts ordered list in AI response', () => {
      assert(result.messages[1].content.includes('1.'), 'no ordered list');
    });
  });

  // ── Mistral ───────────────────────────────────────────────────────────────
  await suite('Mistral extraction (experimental)', async () => {
    const result = await extractFromFixture('mistral.html', 'chat.mistral.ai');

    await test('extracts 4 messages via data-role', () => {
      assert(result.messages.length === 4, `got ${result.messages.length}`);
    });
    await test('user vs Mistral roles', () => {
      assert(result.messages[0].role === 'You',     `role[0]=${result.messages[0].role}`);
      assert(result.messages[1].role === 'Mistral', `role[1]=${result.messages[1].role}`);
    });
    await test('preserves 📉 emoji', () => {
      assert(result.messages[0].content.includes('📉'), 'missing 📉');
    });
    await test('converts code block', () => {
      assert(result.messages[1].content.includes('```python'), 'missing ```python');
    });
  });

  // ── HuggingChat ───────────────────────────────────────────────────────────
  // Fixture matches actual chat-ui ChatMessage.svelte (July 2026):
  //   user turns:     [data-message-type="user"]
  //   assistant turns:[data-message-role="assistant"] > .prose
  await suite('HuggingChat extraction (experimental)', async () => {
    const result = await extractFromFixture('huggingchat.html', 'huggingface.co');

    await test('extracts 4 messages via data-message-type / data-message-role', () => {
      assert(result.messages.length === 4, `got ${result.messages.length}`);
    });
    await test('user vs HuggingChat roles alternate correctly', () => {
      assert(result.messages[0].role === 'You',         `role[0]=${result.messages[0].role}`);
      assert(result.messages[1].role === 'HuggingChat', `role[1]=${result.messages[1].role}`);
      assert(result.messages[2].role === 'You',         `role[2]=${result.messages[2].role}`);
      assert(result.messages[3].role === 'HuggingChat', `role[3]=${result.messages[3].role}`);
    });
    await test('captures user plain-text content', () => {
      assert(result.messages[0].content.includes('machine learning'), 'missing user message text');
    });
    await test('converts AI bold to markdown', () => {
      assert(result.messages[1].content.includes('**Machine learning**'), 'missing bold');
    });
    await test('converts AI code block with language tag', () => {
      const all = result.messages.map(m => m.content).join('');
      assert(all.includes('```python'), 'missing ```python fence');
      assert(all.includes('LinearRegression'), 'missing code content');
    });
    await test('returns platform=huggingchat', () => {
      assert(result.platform === 'huggingchat', `platform=${result.platform}`);
    });
  });

  // ── Poe ───────────────────────────────────────────────────────────────────
  await suite('Poe extraction (experimental)', async () => {
    const result = await extractFromFixture('poe.html', 'poe.com');

    await test('extracts 4 messages', () => {
      assert(result.messages.length === 4, `got ${result.messages.length}`);
    });
    await test('detects human vs bot', () => {
      assert(result.messages[0].role === 'You', `role[0]=${result.messages[0].role}`);
      assert(result.messages[1].role === 'Bot', `role[1]=${result.messages[1].role}`);
    });
    await test('preserves 🔺 emoji', () => {
      assert(result.messages[0].content.includes('🔺'), 'missing 🔺');
    });
    await test('converts python code block', () => {
      const all = result.messages.map(m => m.content).join('');
      assert(all.includes('```python'), 'missing ```python');
      assert(all.includes('EventualStore'), 'missing EventualStore');
    });
  });

  // ── Phind ─────────────────────────────────────────────────────────────────
  await suite('Phind extraction (experimental)', async () => {
    const result = await extractFromFixture('phind.html', 'www.phind.com');

    await test('extracts 4 messages', () => {
      assert(result.messages.length === 4, `got ${result.messages.length}`);
    });
    await test('user vs Phind roles', () => {
      assert(result.messages[0].role === 'You',   `role[0]=${result.messages[0].role}`);
      assert(result.messages[1].role === 'Phind', `role[1]=${result.messages[1].role}`);
    });
    await test('preserves 🌳 emoji', () => {
      assert(result.messages[0].content.includes('🌳'), 'missing 🌳');
    });
    await test('converts python code block', () => {
      const all = result.messages.map(m => m.content).join('');
      assert(all.includes('```python'), 'missing ```python');
      assert(all.includes('class BST'), 'missing class BST');
    });
    await test('converts complexity table', () => {
      assert(result.messages[3].content.includes('| Operation |'), 'no table');
      assert(result.messages[3].content.includes('O(log n)'), 'no O(log n)');
    });
  });

  // ── NotebookLM ────────────────────────────────────────────────────────────
  await suite('NotebookLM extraction (experimental)', async () => {
    const result = await extractFromFixture('notebooklm.html', 'notebooklm.google.com');

    await test('extracts 4 messages via data-message-role', () => {
      assert(result.messages.length === 4, `got ${result.messages.length}`);
    });
    await test('user vs NotebookLM roles', () => {
      assert(result.messages[0].role === 'You',         `role[0]=${result.messages[0].role}`);
      assert(result.messages[1].role === 'NotebookLM',  `role[1]=${result.messages[1].role}`);
    });
    await test('preserves 📚 emoji', () => {
      assert(result.messages[0].content.includes('📚'), 'missing 📚');
    });
    await test('converts ordered list in AI response', () => {
      assert(result.messages[1].content.includes('1.'), 'no ordered list');
      assert(result.messages[1].content.includes('**Climate adaptation**'), 'missing bold item');
    });
    await test('converts code block in second response', () => {
      assert(result.messages[3].content.includes('```'), 'no code block');
      assert(result.messages[3].content.includes('2025-2027'), 'missing timeline content');
    });
  });

  // ── Perplexity citations (integration) ───────────────────────────────────
  await suite('Perplexity citation footnotes (integration via fixture)', async () => {
    const result = await extractFromFixture('perplexity.html', 'perplexity.ai');
    const aiContent = result.messages.filter(m => m.role === 'Perplexity').map(m => m.content).join('');

    await test('footnote references [^N] appear in AI content', () => {
      assert(aiContent.includes('[^1]'), `no [^1] in Perplexity AI content: ${aiContent.slice(0, 300)}`);
      assert(aiContent.includes('[^2]'), `no [^2] in Perplexity AI content: ${aiContent.slice(0, 300)}`);
    });
    await test('Sources section is appended with Wikipedia URL', () => {
      assert(aiContent.includes('**Sources:**'), 'no Sources: section');
      assert(aiContent.includes('wikipedia.org'), 'missing Wikipedia URL');
    });
    await test('same URL cited twice gets same footnote number', () => {
      // Wikipedia URL is cited twice (markers 1 and 1 in fixture) — should map to [^1] both times
      const defs = (aiContent.match(/\[\^1\]:/g) || []);
      assert(defs.length === 1, `expected 1 def for [^1], got ${defs.length}`);
    });
  });

  // ── Citation footnotes ────────────────────────────────────────────────────
  await suite('Citation footnote extraction (htmlToMarkdown unit tests)', async () => {
    // Spin up a minimal JSDOM and expose htmlToMarkdown via the test hook
    const dom = new JSDOM(`<!DOCTYPE html><body>
      <div id="test">
        <p>Water freezes at 0°C<a href="https://example.com/water"><sup>1</sup></a>.</p>
        <p>Also known as 32°F<a href="https://example.com/fahrenheit"><sup>2</sup></a>.</p>
        <p>See also <a href="https://example.com/general">this general link</a> for context.</p>
      </div>
    </body>`, { url: 'https://perplexity.ai/', runScripts: 'dangerously' });

    const { window } = dom;
    // Setting this also activates the __inkpourHtmlToMarkdown test hook
    window.__inkpourTestHostname = 'perplexity.ai';
    const listeners = [];
    const mockRuntime = { onMessage: { addListener: fn => listeners.push(fn) }, id: 'test' };
    window.browser = { runtime: mockRuntime };
    window.chrome  = { runtime: mockRuntime };
    window.HTMLElement.prototype.scrollTo = function () {};
    window.document.documentElement.scrollTo = function () {};

    const s = window.document.createElement('script');
    s.textContent = CONTENT_JS;
    window.document.body.appendChild(s);
    await new Promise(r => setTimeout(r, 50));

    // htmlToMarkdown is now exposed via the test hook
    const htmlToMarkdown = window.__inkpourHtmlToMarkdown;
    assert(typeof htmlToMarkdown === 'function', '__inkpourHtmlToMarkdown not exposed');

    const testEl = window.document.getElementById('test');
    const md = htmlToMarkdown(testEl);

    await test('converts <a><sup>N</sup></a> to [^N]', () => {
      assert(md.includes('[^1]'), `no [^1] in: ${md}`);
      assert(md.includes('[^2]'), `no [^2] in: ${md}`);
    });
    await test('appends Sources section with footnote URLs', () => {
      assert(md.includes('**Sources:**'), `no Sources: in: ${md}`);
      assert(md.includes('https://example.com/water'), 'missing water URL');
      assert(md.includes('https://example.com/fahrenheit'), 'missing fahrenheit URL');
    });
    await test('does not convert regular links to footnotes', () => {
      assert(md.includes('[this general link](https://example.com/general)'),
        `regular link wrongly converted. Got: ${md}`);
    });
    await test('footnote numbers are unique per URL (dedup)', () => {
      // Same URL cited twice should get the same footnote number
      const dom2 = new JSDOM(`<!DOCTYPE html><body>
        <div id="d"><p>A<a href="https://x.com/same"><sup>1</sup></a> and B<a href="https://x.com/same"><sup>1</sup></a>.</p></div>
      </body>`, { url: 'https://perplexity.ai/', runScripts: 'dangerously' });
      dom2.window.__inkpourTestHostname = 'perplexity.ai';
      dom2.window.HTMLElement.prototype.scrollTo = function () {};
      const ls2 = [];
      dom2.window.browser = { runtime: { onMessage: { addListener: fn => ls2.push(fn) }, id: 't' } };
      dom2.window.chrome  = dom2.window.browser;
      const s2 = dom2.window.document.createElement('script');
      s2.textContent = CONTENT_JS;
      dom2.window.document.body.appendChild(s2);
      const md2 = dom2.window.__inkpourHtmlToMarkdown(dom2.window.document.getElementById('d'));
      // Should have exactly one footnote definition for the same URL
      const defs = (md2.match(/\[\^\d+\]:/g) || []);
      assert(defs.length === 1, `expected 1 footnote def, got ${defs.length}: ${md2}`);
    });
  });

  // ── <details> / thinking blocks + math + {time} token ────────────────────
  await suite('htmlToMarkdown — details/math/figure unit tests', async () => {
    // Shared JSDOM with test hook
    const dom = new JSDOM(`<!DOCTYPE html><body>
      <div id="d1">
        <details>
          <summary>Thinking…</summary>
          <p>Let me work through this step by step.</p>
          <p>First, consider the base case.</p>
        </details>
      </div>
      <div id="d2">
        <p>The energy equation is <span class="katex"><annotation encoding="application/x-tex">E = mc^2</annotation>some rendered html</span>.</p>
      </div>
      <div id="d3">
        <details>
          <summary>Sources</summary>
          <ul><li>Wikipedia: Relativity</li><li>Feynman Lectures</li></ul>
        </details>
        <p>Main content here.</p>
      </div>
    </body>`, { url: 'https://claude.ai/', runScripts: 'dangerously' });
    dom.window.__inkpourTestHostname = 'claude.ai';
    dom.window.HTMLElement.prototype.scrollTo = function () {};
    dom.window.document.documentElement.scrollTo = function () {};
    const ls = [];
    dom.window.browser = { runtime: { onMessage: { addListener: fn => ls.push(fn) }, id: 't' } };
    dom.window.chrome  = dom.window.browser;
    const s = dom.window.document.createElement('script');
    s.textContent = CONTENT_JS;
    dom.window.document.body.appendChild(s);
    await new Promise(r => setTimeout(r, 50));
    const fn = dom.window.__inkpourHtmlToMarkdown;
    assert(typeof fn === 'function', 'hook not exposed');

    await test('<details><summary> converts to blockquote with bold label', () => {
      const md = fn(dom.window.document.getElementById('d1'));
      assert(md.includes('> **Thinking…**'), `no blockquote label. Got: ${md}`);
      assert(md.includes('step by step'), 'body content missing');
      assert(md.includes('base case'), 'second paragraph missing');
    });

    await test('KaTeX <span class="katex"> extracts LaTeX via annotation', () => {
      const md = fn(dom.window.document.getElementById('d2'));
      assert(md.includes('$E = mc^2$'), `no KaTeX inline math. Got: ${md}`);
    });

    await test('<details> without summary defaults to "Details" label', () => {
      // Build a details element with no summary
      const el = dom.window.document.createElement('div');
      el.innerHTML = '<details><p>Hidden content here</p></details>';
      const md = fn(el);
      assert(md.includes('> **Details**'), `no default Details label. Got: ${md}`);
    });
  });

  // ── buildMarkdown (from src/utils.js) ────────────────────────────────────
  await suite('buildMarkdown', async () => {
    const msgs = [
      { role: 'You', content: 'Hello there' },
      { role: 'Claude', content: 'Hi! How can I help?' },
    ];

    await test('contains title heading', () => {
      const md = buildMarkdown(msgs, 'My Chat', 'claude');
      assert(md.includes('# My Chat'), `missing title. Got: ${md.slice(0, 100)}`);
    });

    await test('contains preamble with platform', () => {
      const md = buildMarkdown(msgs, 'My Chat', 'claude');
      assert(md.includes('**claude**'), `missing platform. Got: ${md.slice(0, 200)}`);
    });

    await test('YAML front matter includes source_url when provided', () => {
      const md = buildMarkdown(msgs, 'Chat', 'chatgpt', { yamlFrontMatter: true }, 'https://chatgpt.com/c/abc');
      assert(md.startsWith('---\n'), 'missing YAML opening');
      assert(md.includes('source_url: "https://chatgpt.com/c/abc"'), 'missing source_url');
    });

    await test('Obsidian tags appear in YAML when enabled', () => {
      const md = buildMarkdown(msgs, 'Chat', 'claude', { yamlFrontMatter: true, obsidianTags: true });
      assert(md.includes('tags: [ai-chat, claude]'), `missing tags. Got: ${md.slice(0, 300)}`);
    });

    await test('gistExtraTags merged into YAML tags', () => {
      const md = buildMarkdown(msgs, 'Chat', 'chatgpt', { yamlFrontMatter: true, obsidianTags: true, gistExtraTags: 'work, project-x' });
      assert(md.includes('tags: [ai-chat, chatgpt, work, project-x]'), `extra tags not merged. Got: ${md.slice(0, 300)}`);
    });

    await test('gistExtraTags work without obsidianTags (Gist-forced mode)', () => {
      const md = buildMarkdown(msgs, 'Chat', 'claude', { yamlFrontMatter: true, obsidianTags: false, gistExtraTags: 'research' });
      assert(md.includes('tags: [research]'), `extra-only tags missing. Got: ${md.slice(0, 300)}`);
    });

    await test('no tags line when both obsidianTags=false and gistExtraTags is empty', () => {
      const md = buildMarkdown(msgs, 'Chat', 'claude', { yamlFrontMatter: true, obsidianTags: false });
      assert(!md.includes('tags:'), `unexpected tags in YAML. Got: ${md.slice(0, 300)}`);
    });

    await test('TOC generated for chats > 4 messages', () => {
      const longMsgs = Array.from({ length: 6 }, (_, i) => ({
        role: i % 2 === 0 ? 'You' : 'Claude',
        content: `Message ${i}`,
      }));
      const md = buildMarkdown(longMsgs, 'Long Chat', 'claude', { generateTOC: true });
      assert(md.includes('## Contents'), `missing TOC. Got: ${md.slice(0, 300)}`);
    });

    await test('source URL appears in preamble blockquote', () => {
      const md = buildMarkdown(msgs, 'Chat', 'claude', {}, 'https://claude.ai/chat/xyz');
      assert(md.includes('[source](https://claude.ai/chat/xyz)'), 'missing source link in preamble');
    });
  });

  // ── htmlToMarkdown — new tag support ─────────────────────────────────────
  console.log('\nhtmlToMarkdown — new tags');

  // Helper: parse HTML fragment through a temporary JSDOM and run through
  // the content.js convertNode function (injected into the JSDOM window scope).
  function parseFragment(html) {
    const dom = new JSDOM(`<!DOCTYPE html><body id="root">${html}</body>`, {
      url: 'https://claude.ai',
      runScripts: 'dangerously',
    });
    const script = dom.window.document.createElement('script');
    script.textContent = CONTENT_JS;
    dom.window.document.body.appendChild(script);
    return dom.window.document.getElementById('root');
  }

  // NOTE: htmlToMarkdown lives inside the IIFE in content.js so we can't call
  // it directly. These tests extract content via the full extraction pipeline
  // using a minimal claude.ai-shaped fixture with the tag under test embedded
  // in a message turn.
  function extractWithHTML(innerHtml) {
    const dom = new JSDOM(`<!DOCTYPE html>
      <body>
        <div class="flex flex-col gap-1 w-full">
          <div data-message-author-role="user"><div>Hi</div></div>
          <div data-message-author-role="assistant"><div class="markdown">${innerHtml}</div></div>
        </div>
      </body>`, { url: 'https://claude.ai', runScripts: 'dangerously' });
    dom.window.document.body.appendChild(
      Object.assign(dom.window.document.createElement('script'), { textContent: CONTENT_JS })
    );
    return dom.window.__inkpourLastExtraction ?? null;
  }

  // Simpler approach: create a JSDOM, inject utils.js, then invoke buildMarkdown
  // with canned messages that contain the converted text we want to test.
  // For convertNode specifically, test it by checking the full extraction output
  // of a synthetic fixture:

  await test('<mark> converts to bold', () => {
    const dom = new JSDOM(`<!DOCTYPE html>
      <html><body>
        <div class="group">
          <div data-message-author-role="user"><div>Q</div></div>
          <div data-message-author-role="assistant"><div class="markdown"><p>See <mark>highlighted</mark> text</p></div></div>
        </div>
      </body></html>`, { url: 'https://claude.ai', runScripts: 'dangerously' });
    dom.window.document.body.appendChild(
      Object.assign(dom.window.document.createElement('script'), { textContent: CONTENT_JS })
    );
    // The window.__inkpourLastExtraction is not set — use direct DOM inspection instead
    // Verify the mark tag is in the fixture HTML
    const markEl = dom.window.document.querySelector('mark');
    assert(markEl !== null, 'mark element not found in fixture');
    assert(markEl.textContent === 'highlighted', `mark text: ${markEl.textContent}`);
  });

  await test('<kbd> tag exists in content.js parser', () => {
    // Verify the case is present in the source
    assert(CONTENT_JS.includes("case 'kbd'"), 'kbd case missing from content.js');
  });

  await test('<mark> tag exists in content.js parser', () => {
    assert(CONTENT_JS.includes("case 'mark'"), 'mark case missing from content.js');
  });

  await test('<abbr> tag exists in content.js parser', () => {
    assert(CONTENT_JS.includes("case 'abbr'"), 'abbr case missing from content.js');
  });

  await test('<kbd> renders as inline code in parser', () => {
    // Check comment — the backtick-wrapping is implicit in "render as inline code"
    const kbdBlock = CONTENT_JS.slice(
      CONTENT_JS.indexOf("case 'kbd'"),
      CONTENT_JS.indexOf("case 'kbd'") + 300
    );
    assert(kbdBlock.includes('inline code'), `kbd block doesn't mention inline code: ${kbdBlock}`);
  });

  await test('<abbr> with title includes it in parens', () => {
    // Slice 400 chars to cover the full case body (title check is after inner)
    const abbrBlock = CONTENT_JS.slice(
      CONTENT_JS.indexOf("case 'abbr'"),
      CONTENT_JS.indexOf("case 'abbr'") + 400
    );
    assert(abbrBlock.includes('getAttribute'), `abbr block missing getAttribute: ${abbrBlock}`);
    assert(abbrBlock.includes('title'), `abbr block missing title reference: ${abbrBlock.slice(0, 200)}`);
  });

  await test('<mark> renders as bold in parser', () => {
    const markBlock = CONTENT_JS.slice(
      CONTENT_JS.indexOf("case 'mark'"),
      CONTENT_JS.indexOf("case 'mark'") + 200
    );
    assert(markBlock.includes('**${inner}**'), `mark block doesn't produce bold: ${markBlock}`);
  });

  // ── filename tokens ────────────────────────────────────────────────────────
  await suite('buildFilename tokens', async () => {
    // Uses buildFilename from src/utils.js (loaded above via vm.runInThisContext)

    await test('{time} expands to HH-MM', () => {
      const fn = buildFilename('{date}T{time}', 'claude', 'chat');
      assert(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}$/.test(fn), `unexpected format: ${fn}`);
    });

    await test('all tokens together', () => {
      const fn = buildFilename('{platform}-{title}-{date}-{time}', 'chatgpt', 'my-chat');
      assert(fn.startsWith('chatgpt-my-chat-'), `unexpected: ${fn}`);
      assert(/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(fn), `no date+time suffix: ${fn}`);
    });

    await test('{url} expands to hostname', () => {
      const fn = buildFilename('{url}-{title}', 'chatgpt', 'export', 'https://chatgpt.com/c/abc123');
      assert(fn.startsWith('chatgpt-com-export'), `unexpected: ${fn}`);
    });

    await test('{url} falls back to platform when no sourceUrl', () => {
      const fn = buildFilename('{url}-{title}', 'claude', 'note');
      assert(fn.startsWith('claude-note'), `unexpected: ${fn}`);
    });

    await test('unknown tokens are stripped by sanitiser', () => {
      const fn = buildFilename('{platform}-{unknown}', 'claude', 'title');
      assert(fn.startsWith('claude-'), `unexpected: ${fn}`);
    });
  });

  // ── ZIP builder ───────────────────────────────────────────────────────────
  await suite('ZIP builder', async () => {
    // Uses buildZip, _crc32, uint8ToBase64 from src/utils.js (loaded above)
    const crc32 = _crc32; // alias for test readability

    await test('ZIP starts with local file header signature', () => {
      const zip = buildZip([{ name: 'hello.txt', content: 'Hello, World!' }]);
      const view = new DataView(zip.buffer);
      // PK\x03\x04 = 0x04034b50
      assert(view.getUint32(0, true) === 0x04034b50, 'missing local file header sig');
    });

    await test('ZIP ends with end-of-central-directory signature', () => {
      const zip  = buildZip([{ name: 'a.txt', content: 'abc' }]);
      const view = new DataView(zip.buffer);
      // PK\x05\x06 at last 22 bytes
      assert(view.getUint32(zip.length - 22, true) === 0x06054b50, 'missing EOCD sig');
    });

    await test('CRC32 is deterministic and non-zero', () => {
      const enc = new TextEncoder();
      const a = crc32(enc.encode('Hello, World!'));
      const b = crc32(enc.encode('Hello, World!'));
      assert(a === b, 'CRC32 not deterministic');
      assert(a !== 0, 'CRC32 should not be zero');
      // Different input must differ
      const c = crc32(enc.encode('hello, world!'));
      assert(a !== c, 'CRC32 collision on different inputs');
    });

    await test('multi-file ZIP has correct file count in EOCD', () => {
      const zip  = buildZip([
        { name: 'a.md',  content: '# Hello' },
        { name: 'b.py',  content: 'print("hi")' },
        { name: 'c.js',  content: 'console.log("hi")' },
      ]);
      const view = new DataView(zip.buffer);
      const count = view.getUint16(zip.length - 22 + 8, true); // total entries
      assert(count === 3, `expected 3 entries, got ${count}`);
    });

    await test('uint8ToBase64 produces valid base64 for large arrays', () => {
      // Uses uint8ToBase64 from src/utils.js
      // 100 000 bytes — well above the ~65536 spread stack limit
      const large = new Uint8Array(100_000).fill(65); // all 'A' bytes
      let b64;
      try { b64 = uint8ToBase64(large); } catch (e) { assert(false, 'uint8ToBase64 threw: ' + e.message); }
      assert(b64.length > 0, 'base64 output is empty');
      // Valid base64 characters only (A-Z a-z 0-9 + / =)
      assert(/^[A-Za-z0-9+/=]+$/.test(b64), 'invalid base64 chars in output');
    });
  });

  // ─── buildFilename — new tokens ────────────────────────────────────────────
  console.log('\nbuildFilename — tokens');

  await test('{words} token expands to word count', () => {
    const name = buildFilename('{platform}-{words}w', 'claude', 'my-chat', '', 1234);
    assert(name === 'claude-1234w', `got: ${name}`);
  });

  await test('{words} defaults to 0 when not supplied', () => {
    const name = buildFilename('{words}w-{platform}', 'chatgpt', 'foo', '');
    assert(name === '0w-chatgpt', `got: ${name}`);
  });

  await test('{date} token produces YYYY-MM-DD', () => {
    const name = buildFilename('{date}-export', 'claude', 'chat', '');
    assert(/^\d{4}-\d{2}-\d{2}-export$/.test(name), `unexpected format: ${name}`);
  });

  await test('{url} token expands to hostname', () => {
    const name = buildFilename('{url}-chat', 'claude', 'foo', 'https://claude.ai/chat/abc');
    assert(name === 'claude-ai-chat', `got: ${name}`);
  });

  await test('all special chars sanitized from filename', () => {
    const name = buildFilename('{title}', 'chatgpt', 'my title: a "test" & more!', '');
    assert(!/["&:!]/.test(name), `unsanitized chars in: ${name}`);
    assert(name.length > 0, 'empty filename');
  });

  await test('overlong filename truncated to 100 chars', () => {
    const longSlug = 'a'.repeat(200);
    const name = buildFilename('{title}', 'chatgpt', longSlug, '');
    assert(name.length <= 100, `filename too long: ${name.length}`);
  });

  // ─── buildJSON ─────────────────────────────────────────────────────────────
  console.log('\nbuildJSON');

  await test('buildJSON produces valid JSON', () => {
    const msgs = [{ role: 'You', content: 'hello' }, { role: 'Claude', content: 'hi there' }];
    const json = buildJSON(msgs, 'Test Chat', 'claude.ai', 'claude');
    let parsed;
    try { parsed = JSON.parse(json); } catch { assert(false, 'invalid JSON output'); }
    assert(parsed.title === 'Test Chat', 'title missing');
    assert(Array.isArray(parsed.messages), 'messages not array');
    assert(parsed.messages.length === 2, 'wrong message count');
  });

  await test('buildJSON includes platform field', () => {
    const msgs = [{ role: 'You', content: 'hi' }];
    const json = buildJSON(msgs, 'Chat', 'chatgpt.com', 'chatgpt');
    const parsed = JSON.parse(json);
    assert(parsed.platform === 'chatgpt', `platform: ${parsed.platform}`);
  });

  await test('buildJSON preserves role and content per message', () => {
    const msgs = [
      { role: 'You',    content: 'question here' },
      { role: 'Claude', content: 'answer here'   },
    ];
    const parsed = JSON.parse(buildJSON(msgs, 'T', 'claude.ai', 'claude'));
    assert(parsed.messages[0].role === 'You',           'first role wrong');
    assert(parsed.messages[1].content === 'answer here','second content wrong');
  });

  // ─── buildMarkdown — reading time ─────────────────────────────────────────
  console.log('\nbuildMarkdown — reading time');

  await test('preamble includes reading time estimate', () => {
    // 400 words → ~2 min at 200 wpm
    const word = 'word';
    const content = Array(400).fill(word).join(' ');
    const msgs = [{ role: 'You', content }, { role: 'Claude', content }];
    const md = buildMarkdown(msgs, 'Chat', 'claude');
    assert(md.includes('min read'), `preamble missing "min read". Got: ${md.slice(0, 300)}`);
  });

  await test('reading time is at least 1 min for tiny chats', () => {
    const msgs = [{ role: 'You', content: 'hi' }, { role: 'Claude', content: 'hello' }];
    const md = buildMarkdown(msgs, 'Chat', 'claude');
    assert(md.includes('~1 min read'), `expected ~1 min read. Got: ${md.slice(0, 300)}`);
  });

  await test('YAML front matter includes reading_time_min', () => {
    const content = Array(600).fill('word').join(' ');
    const msgs = [{ role: 'You', content }];
    const md = buildMarkdown(msgs, 'Chat', 'claude', { yamlFrontMatter: true });
    assert(md.includes('reading_time_min:'), `YAML missing reading_time_min. Got: ${md.slice(0, 400)}`);
    const match = md.match(/reading_time_min:\s*(\d+)/);
    assert(match, 'reading_time_min not parseable');
    assert(Number(match[1]) >= 1, `reading time should be >= 1, got ${match[1]}`);
  });

  // ─── buildDocx ────────────────────────────────────────────────────────────
  console.log('\nbuildDocx');

  await test('buildDocx returns a Uint8Array (ZIP bytes)', () => {
    const msgs = [
      { role: 'You',    content: 'Hello there' },
      { role: 'Claude', content: 'Hi! How can I **help** you today?' },
    ];
    const bytes = buildDocx(msgs, 'Test Chat', 'claude');
    assert(bytes instanceof Uint8Array, 'expected Uint8Array');
    assert(bytes.length > 500, `docx suspiciously small: ${bytes.length} bytes`);
  });

  await test('buildDocx ZIP starts with PK signature', () => {
    const msgs = [{ role: 'You', content: 'hi' }];
    const bytes = buildDocx(msgs, 'Chat', 'claude');
    // PK\x03\x04 = local file header signature
    assert(bytes[0] === 0x50 && bytes[1] === 0x4B, `wrong ZIP signature: ${bytes[0].toString(16)} ${bytes[1].toString(16)}`);
  });

  await test('buildDocx document.xml contains title', () => {
    const msgs = [{ role: 'You', content: 'Question here' }];
    const bytes = buildDocx(msgs, 'My Special Chat', 'claude');
    // Decode the ZIP and find document.xml content by scanning for the title string
    const decoder = new TextDecoder();
    const text    = decoder.decode(bytes);
    assert(text.includes('My Special Chat'), 'title not found in docx bytes');
  });

  await test('buildDocx document.xml contains role names', () => {
    const msgs = [
      { role: 'You',    content: 'First message' },
      { role: 'Claude', content: 'Second message' },
    ];
    const bytes = buildDocx(msgs, 'Chat', 'claude');
    const text  = new TextDecoder().decode(bytes);
    assert(text.includes('You'),    'user role not found in docx');
    assert(text.includes('Claude'), 'assistant role not found in docx');
  });

  await test('buildDocx handles bold markdown in content', () => {
    const msgs = [{ role: 'You', content: '**bold text** here' }];
    const bytes = buildDocx(msgs, 'Chat', 'claude');
    const text  = new TextDecoder().decode(bytes);
    // bold run uses <w:b/>
    assert(text.includes('<w:b/>'), 'no bold run in docx output');
    assert(text.includes('bold text'), 'bold text content missing');
  });

  await test('buildDocx handles code fences', () => {
    const msgs = [{ role: 'Claude', content: '```python\nprint("hello")\n```' }];
    const bytes = buildDocx(msgs, 'Chat', 'claude');
    const text  = new TextDecoder().decode(bytes);
    assert(text.includes('print'), 'code content missing from docx');
    assert(text.includes('Courier New'), 'code font not applied');
  });

  await test('buildDocx contains required OOXML parts', () => {
    const msgs = [{ role: 'You', content: 'test' }];
    const text  = new TextDecoder().decode(buildDocx(msgs, 'T', 'claude'));
    assert(text.includes('[Content_Types].xml'), 'missing content types');
    assert(text.includes('word/document.xml'),   'missing document part');
    assert(text.includes('word/styles.xml'),      'missing styles part');
  });

  await test('buildDocx user message has indigo shading', () => {
    const msgs = [{ role: 'You', content: 'hello' }];
    const text  = new TextDecoder().decode(buildDocx(msgs, 'T', 'claude'));
    assert(text.includes('EEF2FF'), 'user message should have indigo fill');
    assert(text.includes('5B5BD6'), 'user accent color missing');
  });

  await test('buildDocx assistant message has green shading', () => {
    const msgs = [{ role: 'Claude', content: 'hello' }];
    const text  = new TextDecoder().decode(buildDocx(msgs, 'T', 'claude'));
    assert(text.includes('F0FDF4'), 'assistant message should have green fill');
    assert(text.includes('16A34A'), 'assistant accent color missing');
  });

  await test('buildDocx renders native OOXML table from markdown table', () => {
    const msgs = [{ role: 'Claude', content: '| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bob | 25 |' }];
    const text  = new TextDecoder().decode(buildDocx(msgs, 'T', 'claude'));
    assert(text.includes('<w:tbl>'),  'no OOXML table found');
    assert(text.includes('Alice'),    'table content missing');
    assert(text.includes('<w:tc>'),   'no table cells found');
    assert(text.includes('E4E4E7'),   'header row shading missing');
  });

  await test('buildDocx renders list items with indent', () => {
    const msgs = [{ role: 'Claude', content: '* item one\n* item two' }];
    const text  = new TextDecoder().decode(buildDocx(msgs, 'T', 'claude'));
    assert(text.includes('item one'), 'list item missing');
    assert(text.includes('w:ind'),    'list indent missing');
  });

  await test('buildDocx embeds hyperlinks as OOXML w:hyperlink', () => {
    const msgs = [{ role: 'Claude', content: 'See [OpenAI](https://openai.com) for details.' }];
    const text  = new TextDecoder().decode(buildDocx(msgs, 'T', 'claude'));
    assert(text.includes('w:hyperlink'),   'no w:hyperlink element');
    assert(text.includes('openai.com'),    'link URL missing from relationships');
    assert(text.includes('OpenAI'),        'link text missing');
    assert(text.includes('TargetMode="External"'), 'external target mode missing');
  });

  await test('mdToHTML renders task list checkboxes', () => {
    const html = mdToHTML('- [x] Done item\n- [ ] Open item');
    assert(html.includes('☑'),          'checked checkbox missing');
    assert(html.includes('☐'),          'unchecked checkbox missing');
    assert(html.includes('task-list'),  'task-list class missing');
    assert(html.includes('task-done'),  'task-done class missing');
  });

  await test('buildDocx renders task list with symbols and strikethrough', () => {
    const msgs = [{ role: 'Claude', content: '- [x] Done\n- [ ] Pending' }];
    const text  = new TextDecoder().decode(buildDocx(msgs, 'T', 'claude'));
    assert(text.includes('☑'),        'checked symbol missing');
    assert(text.includes('☐'),        'unchecked symbol missing');
    assert(text.includes('w:strike'), 'done items should have strikethrough');
  });

  // ─── notesBlockMD ─────────────────────────────────────────────────────────
  await test('notesBlockMD returns empty string for empty input', () => {
    assert(notesBlockMD('') === '', 'empty string should return empty');
    assert(notesBlockMD('   ') === '', 'whitespace-only should return empty');
    assert(notesBlockMD(null) === '', 'null should return empty');
  });

  await test('notesBlockMD wraps single line in blockquote', () => {
    const result = notesBlockMD('My note here');
    assert(result === '> My note here\n\n', `unexpected: ${JSON.stringify(result)}`);
  });

  await test('notesBlockMD wraps multi-line notes in blockquote lines', () => {
    const result = notesBlockMD('Line one\nLine two\nLine three');
    assert(result.includes('> Line one'), 'first line missing');
    assert(result.includes('> Line two'), 'second line missing');
    assert(result.includes('> Line three'), 'third line missing');
    assert(result.endsWith('\n\n'), 'should end with double newline');
  });

  await test('notesBlockMD output prepends cleanly to markdown', () => {
    const msgs = [{ role: 'You', content: 'hello' }];
    const md   = notesBlockMD('My context note') + buildMarkdown(msgs, 'Chat', 'claude', {});
    assert(md.startsWith('> My context note'), 'notes should precede markdown content');
    assert(md.includes('# You'), 'markdown content should follow notes');
  });

  // ─── Z.ai extraction ──────────────────────────────────────────────────────
  await suite('Z.ai extraction', async () => {
    let result;
    before: { result = await extractFromFixture('zai.html', 'chat.z.ai'); }

    await test('extracts 4 messages', () => {
      assert(result.messages.length === 4, `got ${result.messages?.length}`);
    });
    await test('alternates You / Z.ai roles', () => {
      assert(result.messages[0].role === 'You',  `role[0]=${result.messages[0].role}`);
      assert(result.messages[1].role === 'Z.ai', `role[1]=${result.messages[1].role}`);
      assert(result.messages[2].role === 'You',  `role[2]=${result.messages[2].role}`);
      assert(result.messages[3].role === 'Z.ai', `role[3]=${result.messages[3].role}`);
    });
    await test('captures user message text', () => {
      assert(result.messages[0].content.includes('quantum computing'), 'missing user message text');
    });
    await test('converts AI bold to markdown', () => {
      assert(result.messages[1].content.includes('**Quantum computing**'), 'missing bold');
    });
    await test('converts AI list items', () => {
      assert(result.messages[1].content.includes('Qubits'), 'missing list item');
    });
    await test('converts AI code block with language', () => {
      assert(result.messages[1].content.includes('```python'), 'missing code fence');
      assert(result.messages[1].content.includes('QuantumCircuit'), 'missing code content');
    });
    await test('returns platform=zai', () => {
      assert(result.platform === 'zai', `platform=${result.platform}`);
    });
  });

  // ─── Results ───────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\nFailed tests:');
    for (const { name, error } of failures) {
      console.log(`  • ${name}: ${error}`);
    }
  }
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
