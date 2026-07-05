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

  return listener({ action: 'extract' });
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
  await suite('HuggingChat extraction (experimental)', async () => {
    const result = await extractFromFixture('huggingchat.html', 'huggingface.co');

    await test('extracts 4 messages via data-message-role', () => {
      assert(result.messages.length === 4, `got ${result.messages.length}`);
    });
    await test('user vs HuggingChat roles', () => {
      assert(result.messages[0].role === 'You',         `role[0]=${result.messages[0].role}`);
      assert(result.messages[1].role === 'HuggingChat', `role[1]=${result.messages[1].role}`);
    });
    await test('preserves 🖥️ emoji', () => {
      assert(result.messages[0].content.includes('🖥️'), 'missing 🖥️');
    });
    await test('converts bash code block', () => {
      const all = result.messages.map(m => m.content).join('');
      assert(all.includes('```bash'), 'missing ```bash');
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
