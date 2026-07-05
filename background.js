/**
 * background.js — Inkpour service worker
 * Handles keyboard shortcut commands and context menus without needing the popup open.
 */

const api = (typeof browser !== 'undefined') ? browser : chrome;

// ─── Context menu setup ───────────────────────────────────────────────────

api.runtime.onInstalled.addListener(() => {
  // Parent item only appears on supported AI chat pages
  api.contextMenus.create({
    id:       'inkpour-parent',
    title:    'Export with Inkpour',
    contexts: ['page'],
  });
  api.contextMenus.create({
    id:       'inkpour-md',
    parentId: 'inkpour-parent',
    title:    'Export Markdown',
    contexts: ['page'],
  });
  api.contextMenus.create({
    id:       'inkpour-copy',
    parentId: 'inkpour-parent',
    title:    'Copy Markdown',
    contexts: ['page'],
  });
  api.contextMenus.create({
    id:       'inkpour-json',
    parentId: 'inkpour-parent',
    title:    'Export JSON',
    contexts: ['page'],
  });
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !info.menuItemId.startsWith('inkpour-')) return;
  if (info.menuItemId === 'inkpour-parent') return;

  let response;
  try {
    response = await api.tabs.sendMessage(tab.id, { action: 'extract' });
  } catch {
    return;
  }
  if (!response?.messages?.length) return;

  const stored   = await api.storage.local.get('inkpour_settings');
  const settings = Object.assign(
    { yamlFrontMatter: false, generateTOC: false, filenameTemplate: '{platform}-{title}' },
    stored?.inkpour_settings ?? {}
  );
  const filename = buildFilename(settings.filenameTemplate, response.platform, response.filename);

  if (info.menuItemId === 'inkpour-md') {
    const md  = buildMarkdown(response.messages, response.title, response.site, settings);
    const url = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(md);
    api.downloads.download({ url, filename: filename + '.md', saveAs: false });
  }

  if (info.menuItemId === 'inkpour-copy') {
    const md = buildMarkdown(response.messages, response.title, response.site, settings);
    await api.tabs.sendMessage(tab.id, { action: 'copyToClipboard', text: md });
  }

  if (info.menuItemId === 'inkpour-json') {
    const json = buildJSON(response.messages, response.title, response.site, response.platform);
    const url  = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    api.downloads.download({ url, filename: filename + '.json', saveAs: false });
  }
});

// ─── Keyboard shortcuts ───────────────────────────────────────────────────

api.commands.onCommand.addListener(async (command) => {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  let response;
  try {
    response = await api.tabs.sendMessage(tab.id, { action: 'extract' });
  } catch {
    return; // not a supported page
  }

  if (!response?.messages?.length) return;

  // Load user settings so keyboard shortcuts respect all preferences
  const stored   = await api.storage.local.get('inkpour_settings');
  const settings = Object.assign(
    { yamlFrontMatter: false, generateTOC: false, filenameTemplate: '{platform}-{title}' },
    stored?.inkpour_settings ?? {}
  );

  const filename = buildFilename(settings.filenameTemplate, response.platform, response.filename);

  if (command === 'export-markdown') {
    const md  = buildMarkdown(response.messages, response.title, response.site, settings);
    const url = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(md);
    api.downloads.download({ url, filename: filename + '.md', saveAs: false });
  }

  if (command === 'copy-markdown') {
    // Service workers don't have clipboard access — send to content script to copy
    const md = buildMarkdown(response.messages, response.title, response.site, settings);
    await api.tabs.sendMessage(tab.id, { action: 'copyToClipboard', text: md });
  }

  if (command === 'copy-html') {
    // Copy full standalone HTML to clipboard via content script (no clipboard in SW)
    const html = buildStandaloneHTML(response.messages, response.title, response.site);
    await api.tabs.sendMessage(tab.id, { action: 'copyToClipboard', text: html });
  }

  if (command === 'export-json') {
    const json = buildJSON(response.messages, response.title, response.site, response.platform);
    const url  = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    api.downloads.download({ url, filename: filename + '.json', saveAs: false });
  }
});

// ─── Markdown builder (mirrors popup.js — keep in sync) ──────────────────

function buildMarkdown(messages, title, site, opts = {}) {
  const date    = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const isoDate = new Date().toISOString();
  let md = '';

  if (opts.yamlFrontMatter) {
    const safeTitle = title.replace(/"/g, '\\"');
    const yamlWords = messages
      .map(m => m.content.trim().split(/\s+/).filter(Boolean).length)
      .reduce((a, b) => a + b, 0);
    md += `---\ntitle: "${safeTitle}"\nplatform: ${site}\nmessages: ${messages.length}\nwords: ${yamlWords}\ndate: ${isoDate}\nexporter: inkpour\n---\n\n`;
  }

  const wordCount = messages
    .map(m => m.content.trim().split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => a + b, 0);

  md += `# ${title}\n\n`;
  md += `> Exported from **${site}** on ${date} · ${messages.length} messages · ~${wordCount.toLocaleString()} words\n\n---\n\n`;

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

// ─── JSON builder (mirrors popup.js — keep in sync) ──────────────────────

function buildJSON(messages, title, site, platform) {
  return JSON.stringify({
    exporter:   'inkpour',
    version:    1,
    title,
    platform,
    site,
    exportedAt: new Date().toISOString(),
    messages:   messages.map(({ role, content }) => ({ role, content })),
  }, null, 2);
}

// ─── HTML builders (mirrors popup.js — keep in sync) ─────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mdToHTMLSimple(md) {
  // Minimal MD→HTML for background context (no DOM available)
  const blocks = [];
  md = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const i = blocks.length;
    blocks.push(`<pre><code class="lang-${esc(lang)}">${esc(code.trimEnd())}</code></pre>`);
    return `\x00BLK${i}\x00`;
  });
  md = md.replace(/`([^`\n]+)`/g, (_, c) => `<code>${esc(c)}</code>`);
  md = md.replace(/^(#{1,6})\s+(.+)$/gm, (_, h, t) => `<h${h.length}>${t}</h${h.length}>`);
  md = md.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  md = md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  md = md.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  md = md.replace(/~~(.+?)~~/g, '<del>$1</del>');
  md = md.replace(/^---$/gm, '<hr>');
  md = md.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  md = md.replace(/((?:^\* .+$\n?)+)/gm, match => {
    const items = match.trim().split('\n').map(l => `<li>${l.replace(/^\* /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });
  md = md.replace(/((?:^\d+\. .+$\n?)+)/gm, match => {
    const items = match.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });
  md = md.split(/\n{2,}/).map(chunk => {
    chunk = chunk.trim();
    if (!chunk) return '';
    if (/^</.test(chunk) || chunk.includes('\x00BLK')) return chunk;
    return `<p>${chunk.replace(/\n/g, '<br>')}</p>`;
  }).filter(Boolean).join('\n');
  md = md.replace(/\x00BLK(\d+)\x00/g, (_, i) => blocks[+i]);
  return md;
}

function buildPrintBodyHTML(messages, title, site) {
  const date = new Date().toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const parts = [`<header class="doc-header"><h1>${esc(title)}</h1><p class="meta">Exported from <strong>${esc(site)}</strong> · ${esc(date)}</p></header>`];
  for (const { role, content } of messages) {
    const roleClass = role.toLowerCase() === 'you' ? 'user' : 'assistant';
    parts.push(`<article class="message ${roleClass}"><div class="role-label">${esc(role)}</div><div class="content">${mdToHTMLSimple(content)}</div></article>`);
  }
  return parts.join('\n');
}

function buildStandaloneHTML(messages, title, site) {
  const body = buildPrintBodyHTML(messages, title, site);
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
    .doc-header h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.4rem; }
    .meta { font-size: 0.85rem; color: #6b7280; font-style: italic; }
    .message { margin-bottom: 1.5rem; padding: 1.1rem 1.25rem; border-radius: 8px; border-left: 3px solid transparent; }
    .message.user { background: #f0f4ff; border-left-color: #5b5bd6; }
    .message.assistant { background: #f0fdf4; border-left-color: #16a34a; }
    .role-label { font-family: system-ui, sans-serif; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.6rem; }
    .message.user .role-label { color: #5b5bd6; }
    .message.assistant .role-label { color: #16a34a; }
    .content p { margin: 0.6rem 0; } .content p:first-child { margin-top: 0; } .content p:last-child { margin-bottom: 0; }
    .content ul, .content ol { padding-left: 1.5rem; margin: 0.5rem 0; }
    .content li { margin: 0.25rem 0; }
    .content strong { font-weight: 700; } .content em { font-style: italic; }
    .content code { font-family: 'SF Mono','Fira Code',Consolas,monospace; font-size: 0.85em; background: rgba(0,0,0,0.07); padding: 0.15em 0.35em; border-radius: 4px; }
    .content pre { background: #1e1e2e; color: #cdd6f4; padding: 1rem 1.2rem; border-radius: 6px; overflow-x: auto; margin: 0.75rem 0; font-size: 0.82rem; line-height: 1.55; }
    .content pre code { background: transparent; padding: 0; }
    .content blockquote { border-left: 3px solid #d1d5db; margin: 0.6rem 0; padding: 0.3rem 0.9rem; color: #6b7280; font-style: italic; }
    .content hr { border: none; border-top: 1px solid #e5e7eb; margin: 1rem 0; }
  </style>
</head>
<body><div id="page">${body}</div></body>
</html>`;
}

// ─── Filename builder (mirrors popup.js — keep in sync) ──────────────────

function buildFilename(template, platform, titleSlug) {
  const date = new Date().toISOString().slice(0, 10);
  return (template || '{platform}-{title}')
    .replace(/\{platform\}/g, platform || 'chat')
    .replace(/\{title\}/g,    titleSlug || 'export')
    .replace(/\{date\}/g,     date)
    .replace(/[^a-z0-9_\-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'inkpour-export';
}
