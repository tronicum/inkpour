/**
 * bookmarklet/src/inkpour-bookmarklet.js — Inkpour mobile bookmarklet
 *
 * A standalone `javascript:` bookmarklet for mobile browsers (iOS Safari,
 * Android Chrome) that cannot install WebExtensions at all. Tap it while
 * viewing a supported AI chat page and it extracts the visible conversation,
 * converts it to Markdown, and copies it to the clipboard (with a manual
 * copy-from-overlay fallback when the async Clipboard API is unavailable).
 *
 * DELIBERATELY DUPLICATED, NOT SHARED, with src/content.js / src/utils.js:
 * this file must run standalone inside a `javascript:` URI with zero
 * dependencies, no bundler, and no `browser.*`/`chrome.*` APIs — the
 * extension's content script has none of those constraints, so coupling the
 * two would make both harder to maintain. See bookmarklet/README.md and the
 * PR description for the rationale.
 *
 * Every function below is a plain top-level function (no wrapping IIFE) so
 * `vm.runInThisContext()` in test/run-jsdom.js can load this file and call
 * them directly, exactly like src/utils.js and src/vaultHandle.js already do.
 *
 * IMPORTANT: this file does NOT auto-run anything at load time. Loading it
 * (in a test, or via a plain <script> tag) only defines functions — it has
 * no side effects. The `javascript:` URI that users actually install is
 * produced by bookmarklet/build.js, which appends a single call to
 * `runInkpourBookmarklet()` after minifying this source. That keeps this
 * file safe to load in test/run-jsdom.js against the existing fixtures.
 *
 * Scope (v1, deliberately small):
 *   - ChatGPT (chatgpt.com / chat.openai.com) and Claude (claude.ai) only.
 *   - Copies Markdown to the clipboard. No PDF/HTML/JSON/DOCX/ZIP, no file
 *     downloads, no settings, no history, no YAML front matter, no TOC.
 *   - Exports whatever is currently in the DOM — no scroll-to-load handling.
 */

// ─── HTML → Markdown (adapted subset of src/content.js's htmlToMarkdown) ───
// A trimmed-down converter: no footnote/citation handling, no KaTeX/MathJax,
// no <details> collapsing — just enough structure (headings, paragraphs,
// emphasis, lists, code blocks, tables, links) to produce clean Markdown
// from a ChatGPT or Claude message bubble.

function htmlToMarkdown(element) {
  if (!element) return '';
  return convertNode(element).replace(/\n{3,}/g, '\n\n').trim();
}

function convertNode(node) {
  if (node.nodeType === 3 /* TEXT_NODE */) return node.textContent;
  if (node.nodeType !== 1 /* ELEMENT_NODE */) return '';

  const tag = node.tagName.toLowerCase();
  if (['script', 'style', 'svg', 'button', 'nav', 'header', 'footer'].includes(tag)) return '';

  const children = () => Array.from(node.childNodes).map(convertNode).join('');

  switch (tag) {
    case 'h1': return `\n\n# ${children().trim()}\n\n`;
    case 'h2': return `\n\n## ${children().trim()}\n\n`;
    case 'h3': return `\n\n### ${children().trim()}\n\n`;
    case 'h4': return `\n\n#### ${children().trim()}\n\n`;
    case 'h5': return `\n\n##### ${children().trim()}\n\n`;
    case 'h6': return `\n\n###### ${children().trim()}\n\n`;

    case 'p': return `\n\n${children()}\n\n`;
    case 'br': return '\n';
    case 'hr': return '\n\n---\n\n';

    case 'strong':
    case 'b': {
      const inner = children().trim();
      return inner ? `**${inner}**` : '';
    }

    case 'em':
    case 'i': {
      const inner = children().trim();
      return inner ? `*${inner}*` : '';
    }

    case 'del':
    case 's': {
      const inner = children().trim();
      return inner ? `~~${inner}~~` : '';
    }

    case 'code': {
      if (node.closest('pre')) return node.textContent;
      return `\`${node.textContent}\``;
    }

    case 'pre': {
      const codeEl = node.querySelector('code');
      const lang = (codeEl?.className || '').match(/language-(\w+)/)?.[1] ?? '';
      const code = (codeEl ?? node).textContent;
      return `\n\n\`\`\`${lang}\n${code.trimEnd()}\n\`\`\`\n\n`;
    }

    case 'blockquote': {
      const inner = children().trim().split('\n').map(l => `> ${l}`).join('\n');
      return `\n\n${inner}\n\n`;
    }

    case 'ul': return `\n\n${convertList(node, false)}\n\n`;
    case 'ol': return `\n\n${convertList(node, true)}\n\n`;
    case 'li': return children();

    case 'a': {
      const href = node.getAttribute('href') || '';
      const innerText = children();
      if (!href || href.startsWith('#')) return innerText;
      return `[${innerText}](${href})`;
    }

    case 'img': {
      const alt = node.getAttribute('alt') || '';
      let src = node.getAttribute('src') || '';
      if (src.startsWith('data:')) src = '[embedded image]';
      else if (src.startsWith('blob:')) src = '[blob image — not persistent]';
      if (!src && !alt) return '';
      return `![${alt}](${src})`;
    }

    case 'table': return convertTable(node);

    default: return children();
  }
}

function convertList(listEl, ordered, depth = 0) {
  const indent = '  '.repeat(depth);
  return Array.from(listEl.children)
    .filter(el => el.tagName.toLowerCase() === 'li')
    .map((li, i) => {
      const nested = li.querySelector('ul, ol');
      const bullet = ordered ? `${i + 1}.` : '*';
      const inlineNodes = Array.from(li.childNodes).filter(
        n => !(n.nodeType === 1 && ['ul', 'ol'].includes(n.tagName.toLowerCase()))
      );
      const inlineText = inlineNodes.map(convertNode).join('').trim();
      let result = `${indent}${bullet} ${inlineText}`;
      if (nested) {
        result += '\n' + convertList(nested, nested.tagName.toLowerCase() === 'ol', depth + 1);
      }
      return result;
    })
    .join('\n');
}

function convertTable(table) {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (!rows.length) return '';
  const toRow = tr =>
    Array.from(tr.querySelectorAll('th, td')).map(c => convertNode(c).replace(/\|/g, '\\|').trim());
  const header = toRow(rows[0]);
  const body = rows.slice(1).map(toRow);
  const sep = header.map(() => '---');
  return `\n\n${[
    `| ${header.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...body.map(r => `| ${r.join(' | ')} |`),
  ].join('\n')}\n\n`;
}

// ─── Site detection ─────────────────────────────────────────────────────────
// Only ChatGPT and Claude are in scope for v1. Returns null for everything
// else so the bookmarklet can show a clear "unsupported page" message
// instead of silently doing nothing (or worse, throwing).

function detectSite() {
  // Allow the test harness to inject a fake hostname without touching
  // window.location, mirroring src/content.js's own test hook.
  const host = (typeof window !== 'undefined' && window.__inkpourTestHostname) || location.hostname;
  if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
  if (host.includes('claude.ai')) return 'claude';
  return null;
}

// ─── Per-site extractors (adapted from src/content.js) ─────────────────────

function sortByDOMOrder(a, b) {
  const pos = a.el.compareDocumentPosition(b.el);
  return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
}

function extractChatGPT() {
  const turns = document.querySelectorAll('[data-message-author-role]');
  if (!turns.length) return null;
  return Array.from(turns).map(turn => {
    const role = turn.getAttribute('data-message-author-role');
    const label = role === 'user' ? 'You' : 'ChatGPT';
    const contentEl = (turn.querySelector('.markdown, [class*="prose"], .text-message') ?? turn);
    const content = htmlToMarkdown(contentEl);
    return { role: label, content };
  }).filter(m => m.content);
}

function extractClaude() {
  const userEls = Array.from(document.querySelectorAll('[data-testid="user-message"]'))
    .map(el => ({ el, role: 'You' }));

  const assistantEls = Array.from(document.querySelectorAll(
    '.font-claude-message:not(#markdown-artifact), ' +
    '.font-claude-response:not(#markdown-artifact), ' +
    '[data-testid="assistant-message"]'
  )).map(el => ({ el, role: 'Claude' }));

  const combined = [...userEls, ...assistantEls].sort(sortByDOMOrder);
  if (!combined.length) return null;
  return combined.map(({ el, role }) => ({ role, content: htmlToMarkdown(el) })).filter(m => m.content);
}

// ─── Title derivation (simplified from src/content.js) ──────────────────────

const GENERIC_TITLE_RE = /^(new\s+chat|new\s+conversation|untitled|chat|conversation|claude|chatgpt|gpt|assistant|chat\s+export|start\s+a\s+new\s+chat)$/i;

function getCleanTitle() {
  const rawTitle = (document.title || '').replace(/[<>:"/\\|?*\n]/g, ' ').trim() || 'Chat Export';
  return rawTitle
    .replace(/\s[-–]\s*(ChatGPT|Claude)$/i, '')
    .trim();
}

function deriveTitle(messages) {
  const clean = getCleanTitle();
  if (clean.length > 10 && !GENERIC_TITLE_RE.test(clean)) return clean;

  const firstUser = messages.find(m => {
    const r = (m.role || '').toLowerCase();
    return r === 'you' || r === 'user' || r === 'human';
  });
  if (!firstUser) return clean || 'Chat Export';

  const words = firstUser.content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#*`_~[\]()>|\\]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1)
    .slice(0, 8)
    .join(' ');

  return words.length > 4 ? words : (clean || 'Chat Export');
}

// ─── Extraction entry point ─────────────────────────────────────────────────

/**
 * Detects the site, runs the matching extractor, and returns
 * { messages, title, site } — or null when the current page is not a
 * supported platform, or when the expected DOM structure isn't found
 * (e.g. the page hasn't fully loaded, or the site changed its markup).
 * Never throws.
 */
function extractConversation() {
  const site = detectSite();
  if (!site) return null;

  let messages = null;
  try {
    if (site === 'chatgpt') messages = extractChatGPT();
    else if (site === 'claude') messages = extractClaude();
  } catch (err) {
    return null;
  }

  if (!messages || !messages.length) return null;

  const title = deriveTitle(messages);
  return { messages, title, site };
}

// ─── Markdown document builder (matches buildMarkdown()'s output shape) ────

function buildMarkdownDoc(messages, title, site) {
  const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
  let md = `# ${title}\n\n`;
  md += `> Exported from **${site}** on ${date} via the Inkpour mobile bookmarklet\n\n---\n\n`;
  for (const { role, content } of messages) {
    md += `## ${role}\n\n${content.trim()}\n\n---\n\n`;
  }
  md += `*Exported with [Inkpour](https://github.com/tronicum/inkpour) (mobile bookmarklet)*\n`;
  return md;
}

// ─── Clipboard write + manual-copy fallback ─────────────────────────────────
// Mobile Safari (and some hardened Chrome configurations) restrict
// navigator.clipboard.writeText() to genuine, synchronous-feeling user
// gestures, and refuse it entirely in some contexts (non-HTTPS-ish origins,
// cross-origin iframes, or simply "not trusted enough"). A `javascript:`
// bookmarklet tap *is* a user gesture, so the async Clipboard API usually
// works — but it can still throw (denied permission, insecure context,
// API missing on older WebKit). We must never leave the user with nothing:
// on any failure, fall back to a visible <textarea> overlay pre-selected so
// a manual copy (a native, always-available action) still gets the job
// done in one more tap.

function showOverlay(markdown, message) {
  const overlay = document.createElement('div');
  overlay.setAttribute('data-inkpour-bookmarklet-overlay', '1');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.6);' +
    'display:flex;align-items:center;justify-content:center;padding:16px;';

  const panel = document.createElement('div');
  panel.style.cssText =
    'background:#fff;color:#111;border-radius:8px;padding:16px;max-width:480px;' +
    'width:100%;max-height:80vh;display:flex;flex-direction:column;gap:8px;' +
    'font-family:sans-serif;box-shadow:0 4px 24px rgba(0,0,0,0.3);';

  const label = document.createElement('div');
  label.textContent = message || 'Inkpour: copy failed automatically — select all and copy manually:';
  label.style.cssText = 'font-size:14px;font-weight:bold;';

  const textarea = document.createElement('textarea');
  textarea.value = markdown;
  textarea.readOnly = true;
  textarea.style.cssText =
    'width:100%;flex:1;min-height:200px;font-family:monospace;font-size:12px;' +
    'padding:8px;box-sizing:border-box;';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText =
    'align-self:flex-end;padding:8px 16px;border-radius:6px;border:none;' +
    'background:#111;color:#fff;font-size:14px;';
  closeBtn.addEventListener('click', () => overlay.remove());

  panel.appendChild(label);
  panel.appendChild(textarea);
  panel.appendChild(closeBtn);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // Pre-select so a single "Copy" tap (from the mobile text-selection menu)
  // works immediately without the user having to select the text themselves.
  textarea.focus();
  textarea.select();
  if (typeof textarea.setSelectionRange === 'function') {
    textarea.setSelectionRange(0, textarea.value.length);
  }
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.setAttribute('data-inkpour-bookmarklet-toast', '1');
  toast.textContent = message;
  toast.style.cssText =
    'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
    'z-index:2147483647;background:#111;color:#fff;padding:10px 16px;' +
    'border-radius:8px;font-family:sans-serif;font-size:14px;max-width:90vw;' +
    'text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.3);';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/**
 * Attempts navigator.clipboard.writeText(markdown); on any rejection or
 * absence of the API, shows the manual-copy overlay instead. Always
 * resolves (never rejects) so callers don't need their own try/catch.
 */
function copyMarkdownToClipboard(markdown) {
  const canUseAsyncClipboard =
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function' &&
    typeof window !== 'undefined' &&
    // (window.isSecureContext undefined, e.g. in tests, is treated as OK)
    window.isSecureContext !== false;

  if (!canUseAsyncClipboard) {
    showOverlay(markdown);
    return Promise.resolve(false);
  }

  return navigator.clipboard.writeText(markdown).then(
    () => {
      showToast('Inkpour: conversation copied to clipboard as Markdown ✓');
      return true;
    },
    () => {
      showOverlay(markdown);
      return false;
    }
  );
}

// ─── Entry point invoked by the installed javascript: bookmarklet ──────────
// This function is NOT called anywhere in this file (see the header comment)
// — bookmarklet/build.js appends the call when it produces the installable
// `javascript:` URI, so simply loading/parsing this source (as the test
// harness does) has no side effects.

function runInkpourBookmarklet() {
  const result = extractConversation();
  if (!result) {
    if (typeof alert === 'function') {
      alert('Inkpour: this page isn’t a supported chat (ChatGPT or Claude), or no messages were found on screen. Scroll so the conversation is visible, then try again.');
    }
    return;
  }
  const markdown = buildMarkdownDoc(result.messages, result.title, result.site);
  copyMarkdownToClipboard(markdown);
}
