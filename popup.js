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
  const settingsBtn = document.getElementById('settingsBtn');
  const status      = document.getElementById('status');

  // ─── Settings ────────────────────────────────────────────────────────────

  settingsBtn.addEventListener('click', () => {
    // Opens the extension's options page when one exists;
    // placeholder until settings.html is built.
    if (api.runtime.openOptionsPage) {
      api.runtime.openOptionsPage();
    }
  });

  // ─── Markdown export ─────────────────────────────────────────────────────

  mdBtn.addEventListener('click', async () => {
    clearStatus();
    setLoading(mdBtn, true);
    try {
      const data = await extractFromPage();
      const md   = buildMarkdown(data.messages, data.title, data.site);
      downloadFile(md, `${data.filename}.md`, 'text/markdown;charset=utf-8');
      setStatus('✓ Saved — check your Downloads folder', 'success');
    } catch (err) {
      setStatus(err.message, 'error');
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
    } catch (err) {
      setStatus(err.message, 'error');
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
      downloadFile(fullHTML, `${data.filename}.html`, 'text/html;charset=utf-8');
      setStatus('✓ Saved — check your Downloads folder', 'success');
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      setLoading(htmlBtn, false);
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
      throw new Error('Navigate to a supported AI chat page and make sure the conversation has loaded.');
    }

    if (!response)         throw new Error('No response from page. Try refreshing the tab.');
    if (response.error)    throw new Error(response.error);
    if (!response.messages?.length) throw new Error('No messages found.');

    return response; // { messages, title, site, filename }
  }

  // ─── Markdown builder ─────────────────────────────────────────────────────

  function buildMarkdown(messages, title, site) {
    const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
    let md = `# ${title}\n\n`;
    md += `> Exported from **${site}** on ${date}\n\n---\n\n`;
    for (const { role, content } of messages) {
      md += `## ${role}\n\n${content.trim()}\n\n---\n\n`;
    }
    return md;
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
  </style>
</head>
<body>
  <div id="page">
${bodyContent}
  </div>
</body>
</html>`;
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.className   = type; // '', 'success', or 'error'
  }

  function clearStatus() {
    setStatus('', '');
  }

})();
