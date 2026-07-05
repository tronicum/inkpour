/**
 * popup.js — Inkpour
 * Coordinates extraction (via content script) and export (MD download / PDF tab).
 */

(function () {
  'use strict';

  const api = (typeof browser !== 'undefined') ? browser : chrome;

  const mdBtn       = document.getElementById('mdBtn');
  const pdfBtn      = document.getElementById('pdfBtn');
  const htmlBtn     = document.getElementById('htmlBtn');
  const copyBtn     = document.getElementById('copyBtn');
  const copyHtmlBtn = document.getElementById('copyHtmlBtn');
  const jsonBtn     = document.getElementById('jsonBtn');
  const settingsBtn  = document.getElementById('settingsBtn');
  const historyBtn   = document.getElementById('historyBtn');
  const settingsBtn2 = document.getElementById('settingsBtn2');
  const status       = document.getElementById('status');
  const lastExportEl = document.getElementById('last-export');

  // ─── Load user settings ───────────────────────────────────────────────────

  const SETTING_DEFAULTS = {
    defaultFormat:    'md',
    yamlFrontMatter:  false,
    generateTOC:      false,
    filenameTemplate: '{platform}-{title}',
  };
  let userSettings = { ...SETTING_DEFAULTS };

  api.storage.local.get('inkpour_settings', (result) => {
    userSettings = Object.assign({}, SETTING_DEFAULTS, result?.inkpour_settings ?? {});
    // Highlight default format button
    const btnMap = { md: mdBtn, pdf: pdfBtn, html: htmlBtn, json: jsonBtn };
    const defaultBtn = btnMap[userSettings.defaultFormat];
    if (defaultBtn) defaultBtn.classList.add('default-format');
  });

  // ─── Chip highlighting — detect current platform on popup open ───────────

  const CHIP_HOSTS = {
    'ChatGPT':     ['chatgpt.com', 'chat.openai.com'],
    'Claude':      ['claude.ai'],
    'Gemini':      ['gemini.google.com'],
    'AI Studio':   ['aistudio.google.com'],
    'Copilot':     ['copilot.microsoft.com', 'copilot.com'],
    'Grok':        ['grok.com'],
    'Perplexity':  ['perplexity.ai'],
    'DeepSeek':    ['chat.deepseek.com'],
    'Meta AI':     ['meta.ai'],
    'Mistral':     ['chat.mistral.ai'],
    'HuggingChat': ['huggingface.co'],
    'Poe':         ['poe.com'],
    'Phind':       ['phind.com'],
    'NotebookLM':  ['notebooklm.google.com'],
    'Kagi':        ['kagi.com'],
  };

  (async () => {
    try {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return;
      const url = new URL(tab.url);
      const chipEls = document.querySelectorAll('.chip');
      let matched = false;
      for (const chip of chipEls) {
        const hosts = CHIP_HOSTS[chip.textContent.trim()];
        if (hosts && hosts.some(h => url.hostname.includes(h))) {
          chip.classList.add('active');
          matched = true;
        }
      }
      if (matched) document.querySelector('.chips').classList.add('detected');
    } catch {
      // permission error or non-URL tab — just leave chips as-is
    }
  })();

  // ─── Last export hint ─────────────────────────────────────────────────────
  // Show the most recent successful export as a subtle footer hint.

  (async () => {
    try {
      const result = await api.storage.local.get('inkpour_last_export');
      const last = result?.inkpour_last_export;
      if (!last || !lastExportEl) return;
      const when = formatRelativeTime(last.exportedAt);
      const fmt  = last.format ? ` · ${last.format.toUpperCase()}` : '';
      lastExportEl.textContent = `Last: ${last.platform} · ${last.messageCount} msgs${fmt} · ${when}`;
    } catch {
      // storage unavailable — ignore
    }
  })();

  // ─── Message count peek ───────────────────────────────────────────────────
  // Silently extract on popup open to show "Ready · N messages" before user clicks.
  // Runs after chip detection so the active chip is visible while we load.

  (async () => {
    try {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      const response = await api.tabs.sendMessage(tab.id, { action: 'extract' });
      if (response?.messages?.length) {
        const n    = response.messages.length;
        const words = response.messages
          .map(m => m.content.trim().split(/\s+/).length)
          .reduce((a, b) => a + b, 0);
        setStatus(`Ready · ${n} message${n !== 1 ? 's' : ''} · ~${words.toLocaleString()} words`);
      }
    } catch {
      // Not a supported page or content script not ready — stay silent
    }
  })();

  // ─── Settings ────────────────────────────────────────────────────────────

  settingsBtn.addEventListener('click', () => {
    if (api.runtime.openOptionsPage) api.runtime.openOptionsPage();
  });

  settingsBtn2?.addEventListener('click', () => {
    if (api.runtime.openOptionsPage) api.runtime.openOptionsPage();
  });

  historyBtn?.addEventListener('click', () => {
    api.tabs.create({ url: api.runtime.getURL('history.html') });
  });

  // ─── Markdown export ─────────────────────────────────────────────────────

  mdBtn.addEventListener('click', async () => {
    clearStatus();
    setLoading(mdBtn, true);
    try {
      const data = await extractFromPage();
      const md   = buildMarkdown(data.messages, data.title, data.site, userSettings);
      downloadFile(md, buildFilename(userSettings.filenameTemplate, data.platform, data.filename) + '.md', 'text/markdown;charset=utf-8');
      setStatus('✓ Saved — check your Downloads folder', 'success');
      saveLastExport('md', data, md);
    } catch (err) {
      setStatus(err.message, err.streaming ? 'warning' : 'error');
    } finally {
      setLoading(mdBtn, false);
    }
  });

  // ─── PDF export ──────────────────────────────────────────────────────────

  pdfBtn.addEventListener('click', async () => {
    clearStatus();
    setLoading(pdfBtn, true);
    try {
      const data        = await extractFromPage();
      const bodyContent = buildPrintBodyHTML(data.messages, data.title, data.site);
      localStorage.setItem('inkpour_print', bodyContent);
      await api.tabs.create({ url: api.runtime.getURL('print.html') });
      // For PDF, store the HTML body so history page can re-open the print tab
      saveLastExport('pdf', data, bodyContent);
    } catch (err) {
      setStatus(err.message, err.streaming ? 'warning' : 'error');
      setLoading(pdfBtn, false);
    }
  });

  // ─── HTML export ─────────────────────────────────────────────────────────

  htmlBtn.addEventListener('click', async () => {
    clearStatus();
    setLoading(htmlBtn, true);
    try {
      const data        = await extractFromPage();
      const bodyContent = buildPrintBodyHTML(data.messages, data.title, data.site);
      const fullHTML    = buildStandaloneHTML(bodyContent, data.title);
      downloadFile(fullHTML, buildFilename(userSettings.filenameTemplate, data.platform, data.filename) + '.html', 'text/html;charset=utf-8');
      setStatus('✓ Saved — check your Downloads folder', 'success');
      saveLastExport('html', data, fullHTML);
    } catch (err) {
      setStatus(err.message, err.streaming ? 'warning' : 'error');
    } finally {
      setLoading(htmlBtn, false);
    }
  });

  // ─── Copy to clipboard ───────────────────────────────────────────────────

  copyBtn.addEventListener('click', async () => {
    clearStatus();
    setLoading(copyBtn, true);
    try {
      const data = await extractFromPage();
      const md   = buildMarkdown(data.messages, data.title, data.site, userSettings);
      await navigator.clipboard.writeText(md);
      setStatus('✓ Markdown copied to clipboard', 'success');
      saveLastExport('copy-md', data, md);
    } catch (err) {
      setStatus(err.message, err.streaming ? 'warning' : 'error');
    } finally {
      setLoading(copyBtn, false);
    }
  });

  // ─── Copy as HTML ─────────────────────────────────────────────────────────

  copyHtmlBtn.addEventListener('click', async () => {
    clearStatus();
    setLoading(copyHtmlBtn, true);
    try {
      const data        = await extractFromPage();
      const bodyContent = buildPrintBodyHTML(data.messages, data.title, data.site);
      const fullHTML    = buildStandaloneHTML(bodyContent, data.title);
      await navigator.clipboard.writeText(fullHTML);
      setStatus('✓ HTML copied — paste into any editor', 'success');
      saveLastExport('copy-html', data, fullHTML);
    } catch (err) {
      setStatus(err.message, err.streaming ? 'warning' : 'error');
    } finally {
      setLoading(copyHtmlBtn, false);
    }
  });

  // ─── JSON export ─────────────────────────────────────────────────────────

  jsonBtn.addEventListener('click', async () => {
    clearStatus();
    setLoading(jsonBtn, true);
    try {
      const data = await extractFromPage();
      const json  = buildJSON(data.messages, data.title, data.site, data.platform);
      downloadFile(json, buildFilename(userSettings.filenameTemplate, data.platform, data.filename) + '.json', 'application/json;charset=utf-8');
      setStatus('✓ Saved — check your Downloads folder', 'success');
      saveLastExport('json', data, json);
    } catch (err) {
      setStatus(err.message, err.streaming ? 'warning' : 'error');
    } finally {
      setLoading(jsonBtn, false);
    }
  });

  // ─── Shared extraction helper ─────────────────────────────────────────────

  async function extractFromPage() {
    let tab;
    try {
      [tab] = await api.tabs.query({ active: true, currentWindow: true });
    } catch {
      throw new Error('Cannot access the current tab.');
    }

    let response;
    try {
      response = await api.tabs.sendMessage(tab.id, { action: 'extract' });
    } catch {
      throw new Error('Refresh the chat tab, then try again. (Content script not running — tab was open before the extension loaded.)');
    }

    if (!response)              throw new Error('No response from page. Try refreshing the tab.');
    if (response.streaming)     throw Object.assign(new Error(response.error), { streaming: true });
    if (response.error)         throw new Error(response.error);
    if (!response.messages?.length) throw new Error('No messages found.');

    return response; // { messages, title, site, filename }
  }

  // ─── Markdown builder ─────────────────────────────────────────────────────

  function buildMarkdown(messages, title, site, opts = {}) {
    const date     = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const isoDate  = new Date().toISOString();
    let md = '';

    if (opts.yamlFrontMatter) {
      const safeTitle = title.replace(/"/g, '\\"');
      const wordCount = messages
        .map(m => m.content.trim().split(/\s+/).filter(Boolean).length)
        .reduce((a, b) => a + b, 0);
      md += `---\ntitle: "${safeTitle}"\nplatform: ${site}\nmessages: ${messages.length}\nwords: ${wordCount}\ndate: ${isoDate}\nurl: ${location?.href ?? ''}\nexporter: inkpour\n---\n\n`;
    }

    const wordCount = messages
      .map(m => m.content.trim().split(/\s+/).filter(Boolean).length)
      .reduce((a, b) => a + b, 0);

    md += `# ${title}\n\n`;
    md += `> Exported from **${site}** on ${date} · ${messages.length} messages · ~${wordCount.toLocaleString()} words\n\n---\n\n`;

    // Optional table of contents for longer chats
    if (opts.generateTOC && messages.length > 4) {
      const counters = {};
      md += `## Contents\n\n`;
      for (const { role } of messages) {
        counters[role] = (counters[role] || 0) + 1;
        const n      = counters[role];
        const anchor = `${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${n}`;
        md += `- [${role} (${n})](#${anchor})\n`;
      }
      md += '\n---\n\n';
    }

    // Message sections — numbered when TOC is on so anchors are unique
    const counters = {};
    for (const { role, content } of messages) {
      counters[role] = (counters[role] || 0) + 1;
      const heading = opts.generateTOC
        ? `## ${role} (${counters[role]})`
        : `## ${role}`;
      md += `${heading}\n\n${content.trim()}\n\n---\n\n`;
    }
    return md;
  }

  // ─── Filename builder ─────────────────────────────────────────────────────

  /**
   * Expands a filename template like "{platform}-{title}" into an actual filename slug.
   * Supported tokens: {platform}, {title}, {date}
   */
  function buildFilename(template, platform, titleSlug) {
    const now  = new Date();
    const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const time = now.toISOString().slice(11, 16).replace(':', '-'); // HH-MM
    return (template || '{platform}-{title}')
      .replace(/\{platform\}/g, platform || 'chat')
      .replace(/\{title\}/g,    titleSlug || 'export')
      .replace(/\{date\}/g,     date)
      .replace(/\{time\}/g,     time)
      .replace(/[^a-z0-9_\-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'inkpour-export';
  }

  // ─── JSON builder ────────────────────────────────────────────────────────

  function buildJSON(messages, title, site, platform) {
    return JSON.stringify({
      exporter:  'inkpour',
      version:   1,
      title,
      platform,
      site,
      exportedAt: new Date().toISOString(),
      messages: messages.map(({ role, content }) => ({ role, content })),
    }, null, 2);
  }

  // ─── PDF body builder ─────────────────────────────────────────────────────

  /**
   * Returns the HTML *body content* for print.html.
   * print.html provides the shell (styles, auto-print script).
   */
  function buildPrintBodyHTML(messages, title, site) {
    const date = new Date().toLocaleString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const parts = [
      `<header class="doc-header">
  <h1>${esc(title)}</h1>
  <p class="meta">Exported from <strong>${esc(site)}</strong> · ${esc(date)}</p>
</header>`,
    ];

    for (const { role, content } of messages) {
      const roleClass = (role.toLowerCase() === 'you') ? 'user' : 'assistant';
      parts.push(
        `<article class="message ${roleClass}">
  <div class="role-label">${esc(role)}</div>
  <div class="content">${mdToHTML(content)}</div>
</article>`
      );
    }

    return parts.join('\n');
  }

  // ─── Mini Markdown → HTML renderer (for PDF preview) ─────────────────────

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mdToHTML(md) {
    // 1. Pull out fenced code blocks before any other processing
    const blocks = [];
    md = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const idx = blocks.length;
      blocks.push(`<pre><code class="lang-${esc(lang)}">${esc(code.trimEnd())}</code></pre>`);
      return `\x00BLK${idx}\x00`;
    });

    // 2. Inline code
    md = md.replace(/`([^`\n]+)`/g, (_, c) => `<code>${esc(c)}</code>`);

    // 3. Headings (must come before bold/italic to avoid ## being eaten)
    md = md.replace(/^(#{1,6})\s+(.+)$/gm, (_, h, t) => `<h${h.length}>${t}</h${h.length}>`);

    // 4. Bold + italic combos (order matters)
    md = md.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    md = md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    md = md.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    md = md.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // 5. Horizontal rule
    md = md.replace(/^---$/gm, '<hr>');

    // 6. Blockquotes
    md = md.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // 7. Lists — group consecutive list lines
    md = md.replace(/((?:^\* .+$\n?)+)/gm, match => {
      const items = match.trim().split('\n')
        .map(l => `<li>${l.replace(/^\* /, '')}</li>`).join('');
      return `<ul>${items}</ul>`;
    });
    md = md.replace(/((?:^\d+\. .+$\n?)+)/gm, match => {
      const items = match.trim().split('\n')
        .map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
      return `<ol>${items}</ol>`;
    });

    // 8. Paragraphs — split on blank lines, wrap plain text chunks
    md = md.split(/\n{2,}/).map(chunk => {
      chunk = chunk.trim();
      if (!chunk) return '';
      // Already HTML or a code block placeholder — don't wrap in <p>
      if (/^</.test(chunk) || chunk.includes('\x00BLK')) return chunk;
      // Single newlines inside paragraphs → <br>
      return `<p>${chunk.replace(/\n/g, '<br>')}</p>`;
    }).filter(Boolean).join('\n');

    // 9. Restore code blocks
    md = md.replace(/\x00BLK(\d+)\x00/g, (_, i) => blocks[+i]);

    return md;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  function downloadFile(text, filename, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setLoading(btn, on) {
    btn.disabled = on;
    btn.classList.toggle('loading', on);
  }

  /** Wraps body content in a self-contained HTML file with all styles inlined. */
  function buildStandaloneHTML(bodyContent, title) {
    // Grab the stylesheet from print.html by re-using the same CSS inline.
    // Keeps the downloaded file fully self-contained — no external deps.
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 15px; line-height: 1.7; color: #1a1a1a; background: #f9f9f9; padding: 2rem 1rem; }
    #page { max-width: 800px; margin: 0 auto; background: #fff; padding: 3rem; border-radius: 8px; box-shadow: 0 2px 20px rgba(0,0,0,0.08); }
    .doc-header { margin-bottom: 2.5rem; padding-bottom: 1.25rem; border-bottom: 2px solid #e5e7eb; }
    .doc-header h1 { font-size: 1.75rem; font-weight: 700; color: #111; margin-bottom: 0.4rem; }
    .meta { font-size: 0.85rem; color: #6b7280; font-style: italic; }
    .message { margin-bottom: 1.5rem; padding: 1.1rem 1.25rem; border-radius: 8px; border-left: 3px solid transparent; }
    .message.user { background: #f0f4ff; border-left-color: #5b5bd6; }
    .message.assistant { background: #f0fdf4; border-left-color: #16a34a; }
    .role-label { font-family: system-ui, sans-serif; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.6rem; }
    .message.user .role-label { color: #5b5bd6; }
    .message.assistant .role-label { color: #16a34a; }
    .content h1,.content h2,.content h3,.content h4,.content h5,.content h6 { font-family: system-ui, sans-serif; margin: 1rem 0 0.4rem; line-height: 1.3; }
    .content h1{font-size:1.4rem}.content h2{font-size:1.2rem}.content h3{font-size:1.05rem}
    .content p { margin: 0.6rem 0; }
    .content p:first-child { margin-top: 0; }
    .content p:last-child  { margin-bottom: 0; }
    .content ul,.content ol { padding-left: 1.5rem; margin: 0.5rem 0; }
    .content li { margin: 0.25rem 0; }
    .content strong { font-weight: 700; }
    .content em { font-style: italic; }
    .content del { text-decoration: line-through; color: #9ca3af; }
    .content code { font-family: 'SF Mono','Fira Code',Consolas,monospace; font-size: 0.85em; background: rgba(0,0,0,0.07); padding: 0.15em 0.35em; border-radius: 4px; }
    .content pre { background: #1e1e2e; color: #cdd6f4; padding: 1rem 1.2rem; border-radius: 6px; overflow-x: auto; margin: 0.75rem 0; font-size: 0.82rem; line-height: 1.55; }
    .content pre code { background: transparent; padding: 0; }
    .content blockquote { border-left: 3px solid #d1d5db; margin: 0.6rem 0; padding: 0.3rem 0.9rem; color: #6b7280; font-style: italic; }
    .content hr { border: none; border-top: 1px solid #e5e7eb; margin: 1rem 0; }
    @media (prefers-color-scheme: dark) {
      body { color: #e4e4e7; background: #09090b; }
      #page { background: #18181b; box-shadow: 0 2px 20px rgba(0,0,0,0.4); }
      .doc-header { border-bottom-color: #3f3f46; }
      .doc-header h1 { color: #fafafa; }
      .meta { color: #a1a1aa; }
      .message.user { background: #1e1e3a; }
      .message.assistant { background: #14291f; }
      .content code { background: rgba(255,255,255,0.1); }
      .content blockquote { border-left-color: #52525b; color: #a1a1aa; }
      .content hr { border-top-color: #3f3f46; }
    }
  </style>
</head>
<body>
  <div id="page">
${bodyContent}
  </div>
</body>
</html>`;
  }

  // ─── Export persistence (last hint + rolling history) ─────────────────────

  /**
   * Persists the most recent export as a compact hint AND prepends a full
   * entry (including content) to the rolling inkpour_history array (max 20).
   *
   * @param {string} format  - 'md', 'pdf', 'html', 'json', 'copy-md', 'copy-html'
   * @param {object} data    - { messages, title, platform, filename }
   * @param {string} content - the actual exported string (for re-download)
   */
  function saveLastExport(format, data, content = '') {
    const wordCount = data.messages
      .map(m => m.content.trim().split(/\s+/).filter(Boolean).length)
      .reduce((a, b) => a + b, 0);

    const record = {
      id:           Date.now().toString(),
      title:        data.title,
      platform:     data.platform,
      slug:         data.filename,
      format,
      messageCount: data.messages.length,
      wordCount,
      exportedAt:   new Date().toISOString(),
      content,      // may be empty for PDF (handled separately via localStorage)
    };

    // Update last-export hint
    api.storage.local.set({ inkpour_last_export: record });
    if (lastExportEl) {
      const fmtLabel = format.toUpperCase().replace('-', ' ');
      lastExportEl.textContent =
        `Last: ${data.platform} · ${data.messages.length} msgs · ${fmtLabel} · just now`;
    }

    // Prepend to rolling history (max 20 entries)
    api.storage.local.get('inkpour_history').then((result) => {
      const history = result?.inkpour_history ?? [];
      history.unshift(record);
      if (history.length > 20) history.splice(20);
      api.storage.local.set({ inkpour_history: history });
    }).catch(() => {});
  }

  /**
   * Returns a human-friendly relative time string ("just now", "5m ago", "2h ago", "3d ago").
   */
  function formatRelativeTime(isoString) {
    const diff    = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1)  return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)   return `${hours}h ago`;
    const days  = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // ─── Status helpers ───────────────────────────────────────────────────────

  function setStatus(message, type) {
    status.textContent = message;
    status.className   = type; // '', 'success', or 'error'
  }

  function clearStatus() {
    setStatus('', '');
  }

})();
