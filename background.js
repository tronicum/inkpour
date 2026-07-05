/**
 * background.js — Inkpour service worker
 * Handles keyboard shortcut commands and context menus without needing the popup open.
 */

// ─── Shared utilities (buildMarkdown, buildFilename, buildJSON, buildZip, etc.)
importScripts('src/utils.js');

const api = (typeof browser !== 'undefined') ? browser : chrome;

// ─── Downloads subfolder helper ───────────────────────────────────────────
function withSubfolder(settings, filename) {
  const sub = (settings.downloadSubfolder || '').trim().replace(/\/+$/, '');
  return sub ? sub + '/' + filename : filename;
}

// ─── In-page button export requests ──────────────────────────────────────
// Content script sends { action: 'inPageExport', format: 'pdf'|'zip' }
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
    const filename  = buildFilename(settings.filenameTemplate, response.platform, response.filename, sourceUrl);

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
      api.downloads.download({ url, filename: withSubfolder(settings, filename + '.zip'), saveAs: false });
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
  const filename  = buildFilename(settings.filenameTemplate, response.platform, response.filename, sourceUrl);

  if (info.menuItemId === 'inkpour-md') {
    const md  = buildMarkdown(response.messages, response.title, response.site, settings, sourceUrl);
    const url = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(md);
    api.downloads.download({ url, filename: withSubfolder(settings, filename + '.md'), saveAs: false });
  }

  if (info.menuItemId === 'inkpour-copy') {
    const md = buildMarkdown(response.messages, response.title, response.site, settings, sourceUrl);
    await api.tabs.sendMessage(tab.id, { action: 'copyToClipboard', text: md });
  }

  if (info.menuItemId === 'inkpour-json') {
    const json = buildJSON(response.messages, response.title, response.site, response.platform);
    const url  = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    api.downloads.download({ url, filename: withSubfolder(settings, filename + '.json'), saveAs: false });
  }

  if (info.menuItemId === 'inkpour-zip') {
    const { files } = buildZipExport(response.messages, response.title, response.site, settings, sourceUrl);
    const zipBytes  = buildZip(files);
    const b64  = uint8ToBase64(zipBytes);
    const url  = 'data:application/zip;base64,' + b64;
    api.downloads.download({ url, filename: withSubfolder(settings, filename + '.zip'), saveAs: false });
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
    { yamlFrontMatter: false, generateTOC: false, filenameTemplate: '{platform}-{title}', downloadSubfolder: '', obsidianTags: false },
    stored?.inkpour_settings ?? {}
  );

  const sourceUrl = tab.url || '';
  const filename  = buildFilename(settings.filenameTemplate, response.platform, response.filename, sourceUrl);

  if (command === 'export-markdown') {
    const md  = buildMarkdown(response.messages, response.title, response.site, settings, sourceUrl);
    const url = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(md);
    api.downloads.download({ url, filename: withSubfolder(settings, filename + '.md'), saveAs: false });
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
    api.downloads.download({ url, filename: withSubfolder(settings, filename + '.json'), saveAs: false });
  }

  if (command === 'export-zip') {
    const { files } = buildZipExport(response.messages, response.title, response.site, settings, sourceUrl);
    const zipBytes  = buildZip(files);
    // base64-encode for data: URL (no createObjectURL in SW)
    const b64  = uint8ToBase64(zipBytes);
    const url  = 'data:application/zip;base64,' + b64;
    api.downloads.download({ url, filename: withSubfolder(settings, filename + '.zip'), saveAs: false });
  }

  if (command === 'upload-gist') {
    const token = settings.githubToken || '';
    if (!token) {
      // No token — open settings so user can add one
      api.runtime.openOptionsPage();
      return;
    }
    const md = buildMarkdown(response.messages, response.title, response.site, settings, sourceUrl);
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
    } catch (err) {
      // Network failure — notify via content script toast
      await api.tabs.sendMessage(tab.id, {
        action:  'showToast',
        text:    '✗ Gist upload failed (network error)',
        variant: 'error',
      }).catch(() => {});
      return;
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody.message || `HTTP ${res.status}`;
      await api.tabs.sendMessage(tab.id, {
        action:  'showToast',
        text:    `✗ Gist upload failed: ${msg}`,
        variant: 'error',
      }).catch(() => {});
      return;
    }
    const gist = await res.json();
    // Open the Gist in a new tab
    api.tabs.create({ url: gist.html_url });
    // Also notify in-page
    await api.tabs.sendMessage(tab.id, {
      action:  'showToast',
      text:    '✓ Gist created',
      variant: 'success',
    }).catch(() => {});
  }
});

