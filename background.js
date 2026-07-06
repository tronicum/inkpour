/**
 * background.js — Inkpour service worker
 * Handles keyboard shortcut commands and context menus without needing the popup open.
 */

// ─── Shared utilities (buildMarkdown, buildFilename, buildJSON, buildZip, etc.)
importScripts('src/utils.js');

const api = (typeof browser !== 'undefined') ? browser : chrome;

// ─── Safari downloads polyfill ────────────────────────────────────────────
// Safari does not implement browser.downloads — fall back to injecting a
// temporary <a download> click into the active tab via the content script.
const hasBrowserDownloads = !!(api.downloads && api.downloads.download);

function safeDownload(tabId, url, filename) {
  if (hasBrowserDownloads) {
    api.downloads.download({ url, filename, saveAs: false });
  } else {
    // Safari path: ask content script to do the <a download> trick
    api.tabs.sendMessage(tabId, { action: 'safariDownload', url, filename });
    // Clean up object URL after a delay (content script may need a moment)
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 5000);
  }
}

// ─── Downloads subfolder helper ───────────────────────────────────────────
function withSubfolder(settings, filename) {
  const sub = (settings.downloadSubfolder || '').trim().replace(/\/+$/, '');
  return sub ? sub + '/' + filename : filename;
}

// ─── In-page button export requests ──────────────────────────────────────
// Content script sends { action: 'inPageExport', format: 'pdf'|'zip'|'docx'|'html' }
// Background handles it so the SW can download files / open tabs.

api.runtime.onMessage.addListener((message, sender) => {
  if (message.action !== 'inPageExport' || !sender.tab?.id) return;

  (async () => {
    const tabId = sender.tab.id;
    let response;
    try {
      response = await api.tabs.sendMessage(tabId, { action: 'extract' });
    } catch { return; }
    if (!response?.messages?.length) return;

    const stored   = await api.storage.local.get('inkpour_settings');
    const settings = Object.assign(
      { yamlFrontMatter: false, generateTOC: false, filenameTemplate: '{platform}-{title}', downloadSubfolder: '', obsidianTags: false },
      stored?.inkpour_settings ?? {}
    );
    const sourceUrl = sender.tab.url || '';
    const wordCount = (response.messages || []).reduce((s, m) => s + m.content.trim().split(/\s+/).filter(Boolean).length, 0);
  const filename  = buildFilename(settings.filenameTemplate, response.platform, response.filename, sourceUrl, wordCount, (response.messages||[]).length);

    if (message.format === 'pdf') {
      const bodyContent = buildPrintBodyHTML(response.messages, response.title, response.site);
      await api.storage.local.set({ inkpour_print_pending: bodyContent });
      api.tabs.create({ url: api.runtime.getURL('print.html') });
    }

    if (message.format === 'zip') {
      const { files } = buildZipExport(response.messages, response.title, response.site, settings, sourceUrl);
      const zipBytes  = buildZip(files);
      const b64  = uint8ToBase64(zipBytes);
      const url  = 'data:application/zip;base64,' + b64;
      safeDownload(tabId, url, withSubfolder(settings, filename + '.zip'));
    }

    if (message.format === 'docx') {
      const docxBytes = buildDocx(response.messages, response.title, response.site, settings, sourceUrl);
      const b64  = uint8ToBase64(docxBytes);
      const url  = 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + b64;
      safeDownload(tabId, url, withSubfolder(settings, filename + '.docx'));
    }

    if (message.format === 'html') {
      const html = buildStandaloneHTML(response.messages, response.title, response.site);
      const url  = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
      safeDownload(tabId, url, withSubfolder(settings, filename + '.html'));
    }
  })();
});

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
  api.contextMenus.create({
    id:       'inkpour-zip',
    parentId: 'inkpour-parent',
    title:    'Export ZIP (chat + code files)',
    contexts: ['page'],
  });
  api.contextMenus.create({
    id:       'inkpour-docx',
    parentId: 'inkpour-parent',
    title:    'Export Word document (.docx)',
    contexts: ['page'],
  });
  api.contextMenus.create({
    id:       'inkpour-gist',
    parentId: 'inkpour-parent',
    title:    'Upload to GitHub Gist',
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
    { yamlFrontMatter: false, generateTOC: false, filenameTemplate: '{platform}-{title}', downloadSubfolder: '', obsidianTags: false },
    stored?.inkpour_settings ?? {}
  );
  const sourceUrl = tab?.url || '';
  const wordCount = (response.messages || []).reduce((s, m) => s + m.content.trim().split(/\s+/).filter(Boolean).length, 0);
  const filename  = buildFilename(settings.filenameTemplate, response.platform, response.filename, sourceUrl, wordCount, (response.messages||[]).length);

  if (info.menuItemId === 'inkpour-md') {
    const md  = buildMarkdown(response.messages, response.title, response.site, settings, sourceUrl);
    const url = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(md);
    safeDownload(tab.id, url, withSubfolder(settings, filename + '.md'));
  }

  if (info.menuItemId === 'inkpour-copy') {
    const md = buildMarkdown(response.messages, response.title, response.site, settings, sourceUrl);
    await api.tabs.sendMessage(tab.id, { action: 'copyToClipboard', text: md });
  }

  if (info.menuItemId === 'inkpour-json') {
    const json = buildJSON(response.messages, response.title, response.site, response.platform);
    const url  = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    safeDownload(tab.id, url, withSubfolder(settings, filename + '.json'));
  }

  if (info.menuItemId === 'inkpour-zip') {
    const { files } = buildZipExport(response.messages, response.title, response.site, settings, sourceUrl);
    const zipBytes  = buildZip(files);
    const b64  = uint8ToBase64(zipBytes);
    const url  = 'data:application/zip;base64,' + b64;
    safeDownload(tab.id, url, withSubfolder(settings, filename + '.zip'));
  }

  if (info.menuItemId === 'inkpour-docx') {
    const docxBytes = buildDocx(response.messages, response.title, response.site, settings, sourceUrl);
    const b64  = uint8ToBase64(docxBytes);
    const url  = 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + b64;
    safeDownload(tab.id, url, withSubfolder(settings, filename + '.docx'));
  }

  if (info.menuItemId === 'inkpour-gist') {
    await doGistUpload(tab, settings, response, sourceUrl, filename);
    doWebhook(settings, 'gist', response, wordCount);
    return;
  }

  // Fire webhook after context-menu exports
  const menuFormatMap = {
    'inkpour-md':   'md',
    'inkpour-copy': 'copy-md',
    'inkpour-json': 'json',
    'inkpour-zip':  'zip',
    'inkpour-docx': 'docx',
  };
  const fmt = menuFormatMap[info.menuItemId];
  if (fmt) doWebhook(settings, fmt, response, wordCount);
});

// ─── Webhook helper ───────────────────────────────────────────────────────

function doWebhook(settings, format, response, wordCount) {
  const url = (settings.webhookUrl || '').trim();
  if (!url) return;
  const record = {
    source:       'inkpour',
    id:           Date.now().toString(),
    title:        response.title,
    platform:     response.platform,
    format,
    messageCount: (response.messages || []).length,
    wordCount,
    exportedAt:   new Date().toISOString(),
  };
  // Optionally include the content — background.js doesn't have the built
  // markdown/json at this point in all branches, so we omit content here.
  // Content-inclusive webhooks should be configured via the popup export buttons.
  fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(record),
  }).catch(() => {}); // best-effort
}

// ─── GitHub Gist upload helper ────────────────────────────────────────────

async function doGistUpload(tab, settings, response, sourceUrl, filename) {
  const token = settings.githubToken || '';
  if (!token) {
    api.runtime.openOptionsPage();
    return;
  }
  // Gist exports always carry YAML front matter + base tags for GitHub search.
  const gistSettings = { ...settings, yamlFrontMatter: true, obsidianTags: true, gistExtraTags: settings.gistTags || '' };
  const md = buildMarkdown(response.messages, response.title, response.site, gistSettings, sourceUrl);
  const gistFilename = filename + '.md';
  let res;
  try {
    res = await fetch('https://api.github.com/gists', {
      method:  'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept':        'application/vnd.github.v3+json',
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        description: response.title,
        public:      settings.gistPublic === true,
        files: { [gistFilename]: { content: md } },
      }),
    });
  } catch {
    await api.tabs.sendMessage(tab.id, {
      action: 'showToast', text: '✗ Gist upload failed (network error)', variant: 'error',
    }).catch(() => {});
    return;
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody.message || `HTTP ${res.status}`;
    await api.tabs.sendMessage(tab.id, {
      action: 'showToast', text: `✗ Gist upload failed: ${msg}`, variant: 'error',
    }).catch(() => {});
    return;
  }
  const gist = await res.json();
  api.tabs.create({ url: gist.html_url });
  await api.tabs.sendMessage(tab.id, {
    action: 'showToast', text: '✓ Gist created', variant: 'success',
  }).catch(() => {});
}

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
    { yamlFrontMatter: false, generateTOC: false, filenameTemplate: '{platform}-{title}', downloadSubfolder: '', obsidianTags: false },
    stored?.inkpour_settings ?? {}
  );

  const sourceUrl = tab.url || '';
  const wordCount = (response.messages || []).reduce((s, m) => s + m.content.trim().split(/\s+/).filter(Boolean).length, 0);
  const filename  = buildFilename(settings.filenameTemplate, response.platform, response.filename, sourceUrl, wordCount, (response.messages||[]).length);

  if (command === 'export-markdown') {
    const md  = buildMarkdown(response.messages, response.title, response.site, settings, sourceUrl);
    const url = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(md);
    safeDownload(tab.id, url, withSubfolder(settings, filename + '.md'));
  }

  if (command === 'export-pdf') {
    // SW has no localStorage — store in storage.local, print.js reads both
    const bodyContent = buildPrintBodyHTML(response.messages, response.title, response.site);
    await api.storage.local.set({ inkpour_print_pending: bodyContent });
    api.tabs.create({ url: api.runtime.getURL('print.html') });
  }

  if (command === 'copy-markdown') {
    // Service workers don't have clipboard access — send to content script to copy
    const md = buildMarkdown(response.messages, response.title, response.site, settings, sourceUrl);
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
    safeDownload(tab.id, url, withSubfolder(settings, filename + '.json'));
  }

  if (command === 'export-zip') {
    const { files } = buildZipExport(response.messages, response.title, response.site, settings, sourceUrl);
    const zipBytes  = buildZip(files);
    // base64-encode for data: URL (no createObjectURL in SW)
    const b64  = uint8ToBase64(zipBytes);
    const url  = 'data:application/zip;base64,' + b64;
    safeDownload(tab.id, url, withSubfolder(settings, filename + '.zip'));
  }

  if (command === 'export-docx') {
    const docxBytes = buildDocx(response.messages, response.title, response.site, settings, sourceUrl);
    const b64  = uint8ToBase64(docxBytes);
    const url  = 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + b64;
    safeDownload(tab.id, url, withSubfolder(settings, filename + '.docx'));
  }

  if (command === 'upload-gist') {
    await doGistUpload(tab, settings, response, sourceUrl, filename);
    doWebhook(settings, 'gist', response, wordCount);
    return; // gist handler already opened a tab + toasted
  }

  // Fire webhook after non-gist commands (best-effort)
  const formatMap = {
    'export-markdown': 'md',
    'export-pdf':      'pdf',
    'export-docx':     'docx',
    'copy-markdown':   'copy-md',
    'copy-html':       'copy-html',
    'export-json':     'json',
    'export-zip':      'zip',
  };
  const fmt = formatMap[command];
  if (fmt) doWebhook(settings, fmt, response, wordCount);
});

// ─── Action badge — show "ON" on supported AI chat pages ──────────────────
// Canonical source of truth is supported-sites.json — this flat array is
// derived from it (service workers can't fetch local extension files at runtime).

const SUPPORTED_HOSTS = [
  'chatgpt.com', 'chat.openai.com',
  'claude.ai',
  'gemini.google.com', 'aistudio.google.com',
  'www.google.com', 'google.com',
  'copilot.microsoft.com', 'copilot.com', 'www.copilot.com',
  'grok.com',
  'console.groq.com',
  'perplexity.ai',
  'chat.deepseek.com',
  'meta.ai',
  'chat.mistral.ai',
  'huggingface.co',
  'poe.com',
  'phind.com',
  'notebooklm.google.com',
  'kagi.com',
  'chat.z.ai',
  'venice.ai',
  'lmarena.ai', 'chat.lmsys.org',
  'character.ai', 'www.character.ai',
  'coral.cohere.com',
  'pi.ai',
];

function updateBadge(tabId, url) {
  if (!api.action?.setBadgeText) return; // not available in all browsers/contexts
  let isSupported = false;
  try {
    const hostname = new URL(url).hostname;
    isSupported = SUPPORTED_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
  } catch { /* not a real URL */ }

  if (isSupported) {
    api.action.setBadgeText({ text: 'ON', tabId });
    api.action.setBadgeBackgroundColor({ color: '#16a34a', tabId }); // green
  } else {
    api.action.setBadgeText({ text: '', tabId });
  }
}

// Update badge when a tab finishes loading
api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    updateBadge(tabId, tab.url);
  }
});

// Update badge when user switches tabs
api.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await api.tabs.get(tabId);
    if (tab?.url) updateBadge(tabId, tab.url);
  } catch { /* tab may be gone */ }
});
