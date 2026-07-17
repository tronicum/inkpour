/**
 * background.js — Inkpour service worker
 * Handles keyboard shortcut commands and context menus without needing the popup open.
 */

// ─── Shared utilities (buildMarkdown, buildFilename, buildJSON, buildZip, etc.)
importScripts('src/utils.js');
// ─── Secret scrubbing (scanForSecrets, redactSecrets) ─────────────────────
importScripts('src/redact.js');

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
// obsidianVault takes precedence over downloadSubfolder when set.
function withSubfolder(settings, filename) {
  const sub = ((settings.obsidianVault || settings.downloadSubfolder || '')).trim().replace(/\/+$/, '');
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
      // In-page FAB export has no popup UI to show its own "Extracting…"
      // status (unlike the popup, which shows this inline) — the auto-scroll
      // lazy-loading step in extractMessages() can take a couple of seconds
      // on ChatGPT/Gemini/AI Studio, so without this the page just sits there
      // with no feedback. Fire-and-forget: if the toast fails to show for any
      // reason, the export itself must not be blocked by it.
      api.tabs.sendMessage(tabId, { action: 'showToast', text: api.i18n.getMessage('popupStatusExtracting') }).catch(() => {});
      response = await api.tabs.sendMessage(tabId, { action: 'extract' });
    } catch { return; }
    if (!response?.messages?.length) return;

    const stored   = await api.storage.local.get('inkpour_settings');
    const settings = Object.assign(
      { yamlFrontMatter: false, generateTOC: false, filenameTemplate: '{platform}-{title}', downloadSubfolder: '', obsidianVault: '', obsidianTags: false, scrubSecrets: true },
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

// ─── Batch export (Batch 8): sequential background-tab automation ────────
// popup.js sends { action: 'startBatchExport', conversations: [{title,url}],
// originTabId } after the user ticks conversations from the CURRENT tab's
// own history sidebar (populated via content.js's getConversationList() —
// see src/content.js and planning/TODOs.md Batch 8). Conversations are
// visited ONE AT A TIME in a hidden background tab (not parallel — avoids
// overwhelming per-platform lazy-load behavior and looks less bot-like than
// bursty parallel tab creation), extracted exactly like every other
// extraction path, then aggregated into a single ZIP (one .md file per
// conversation) via the existing buildZip()/buildFilename(). Runs entirely
// in this service worker so it keeps going even if the popup that started
// it gets closed.
//
// Known open questions, not yet resolved — see TODOs.md Batch 8 for detail:
// realistic per-platform load timeouts (the fixed values below are a
// reasonable starting guess, not measured against real slow-loading
// accounts) and how many conversations per run is safe before it risks
// looking bot-like or tripping a platform rate limit. Flagging this
// explicitly rather than silently guessing it away — needs live testing
// against a real account with enough history to matter before this is
// something to rely on for a large batch.

/** Resolve once tabId finishes loading, or reject after timeoutMs. */
function waitForTabLoad(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      api.tabs.onUpdated.removeListener(listener);
      reject(new Error('tab load timeout'));
    }, timeoutMs);

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      api.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    function listener(id, info) {
      if (id === tabId && info.status === 'complete') finish();
    }
    api.tabs.onUpdated.addListener(listener);

    // Race-safe: the tab may already be "complete" by the time we attach
    // (unlikely for a just-created tab, but cheap to guard against).
    api.tabs.get(tabId).then(t => { if (t.status === 'complete') finish(); }).catch(() => {});
  });
}

/**
 * Run the actual batch: visit each conversation in a hidden tab, extract,
 * collect into one ZIP, download it, then report a { succeeded, skipped,
 * total } summary. Never throws — per-conversation failures are caught and
 * counted as skipped, matching the "errors are per-conversation, not fatal
 * to the run" design.
 */
async function runBatchExport(conversations, originTabId) {
  const stored   = await api.storage.local.get('inkpour_settings');
  const settings = Object.assign(
    { yamlFrontMatter: false, generateTOC: false, filenameTemplate: '{platform}-{title}', downloadSubfolder: '', obsidianVault: '', obsidianTags: false, scrubSecrets: true },
    stored?.inkpour_settings ?? {}
  );

  function toast(text, variant) {
    if (!originTabId) return;
    api.tabs.sendMessage(originTabId, { action: 'showToast', text, variant }).catch(() => {});
  }

  const files      = [];
  const usedNames  = new Set();
  let   succeeded  = 0;
  let   skipped    = 0;

  for (let i = 0; i < conversations.length; i++) {
    const { title: sidebarTitle, url } = conversations[i];
    toast(api.i18n.getMessage('popupBatchExportProgress', [String(i + 1), String(conversations.length), sidebarTitle || '']));

    let tab = null;
    try {
      tab = await api.tabs.create({ url, active: false });
      await waitForTabLoad(tab.id, 20000);
      // Give the SPA a moment to hydrate/render turns after the browser's
      // own "complete" event fires — chatgpt/gemini/aistudio are already
      // known to be slow lazy-loaders elsewhere in this codebase (see the
      // streaming/auto-scroll progress work). Not yet tuned per platform.
      await new Promise(r => setTimeout(r, 1500));

      const response = await Promise.race([
        api.tabs.sendMessage(tab.id, { action: 'extract' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('extract timeout')), 15000)),
      ]);

      if (!response?.messages?.length) {
        throw new Error(response?.error || 'empty extraction');
      }

      const sourceUrl = url;
      const wordCount = response.messages.reduce((s, m) => s + m.content.trim().split(/\s+/).filter(Boolean).length, 0);
      let name = buildFilename(settings.filenameTemplate, response.platform, response.filename, sourceUrl, wordCount, response.messages.length);
      let unique = name, n = 2;
      while (usedNames.has(unique)) unique = `${name}-${n++}`; // two conversations can share a title
      usedNames.add(unique);

      const md = buildMarkdown(response.messages, response.title, response.site, settings, sourceUrl);
      files.push({ name: unique + '.md', content: md });
      succeeded++;
    } catch {
      skipped++;
    } finally {
      if (tab) api.tabs.remove(tab.id).catch(() => {});
      await new Promise(r => setTimeout(r, 800)); // don't hammer the site between tabs
    }
  }

  if (files.length) {
    const zipBytes = buildZip(files);
    const b64      = uint8ToBase64(zipBytes);
    const url      = 'data:application/zip;base64,' + b64;
    const stamp    = new Date().toISOString().slice(0, 10);
    safeDownload(originTabId, url, withSubfolder(settings, `inkpour-batch-${stamp}.zip`));
  }

  toast(
    api.i18n.getMessage('popupBatchExportDone', [String(succeeded), String(skipped)]),
    skipped > 0 && succeeded === 0 ? 'error' : (skipped > 0 ? 'info' : 'success')
  );

  return { succeeded, skipped, total: conversations.length };
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action !== 'startBatchExport' || !Array.isArray(message.conversations)) return;
  const originTabId = message.originTabId ?? sender.tab?.id;
  runBatchExport(message.conversations, originTabId)
    .then(result => sendResponse({ ok: true, ...result }))
    .catch(err => sendResponse({ ok: false, error: err.message }));
  return true; // async
});

// ─── Context menu setup ───────────────────────────────────────────────────

api.runtime.onInstalled.addListener(() => {
  // Parent item only appears on supported AI chat pages — reuse the exact
  // match patterns from manifest.json's content_scripts entry (read via the
  // manifest itself, not a separately maintained list) so this can't drift
  // out of sync the way SUPPORTED_HOSTS below already has (still lists
  // phind.com, still missing www.meta.ai/arena.ai). Only the parent item
  // needs documentUrlPatterns: the child items below are only reachable
  // through its submenu, so if the parent doesn't match, they never show.
  const documentUrlPatterns = api.runtime.getManifest()?.content_scripts?.[0]?.matches;

  api.contextMenus.create({
    id:       'inkpour-parent',
    title:    'Export with Inkpour',
    contexts: ['page'],
    ...(documentUrlPatterns ? { documentUrlPatterns } : {}),
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
    // Same "Extracting…" feedback as the in-page FAB path above — the
    // right-click menu has no status UI of its own either.
    api.tabs.sendMessage(tab.id, { action: 'showToast', text: api.i18n.getMessage('popupStatusExtracting') }).catch(() => {});
    response = await api.tabs.sendMessage(tab.id, { action: 'extract' });
  } catch {
    return;
  }
  if (!response?.messages?.length) return;

  const stored   = await api.storage.local.get('inkpour_settings');
  const settings = Object.assign(
    { yamlFrontMatter: false, generateTOC: false, filenameTemplate: '{platform}-{title}', downloadSubfolder: '', obsidianVault: '', obsidianTags: false, scrubSecrets: true },
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
    doWebhook(settings, 'gist', response, wordCount, tab.id);
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
  if (fmt) doWebhook(settings, fmt, response, wordCount, tab.id);
});

// ─── Webhook helper ───────────────────────────────────────────────────────

async function doWebhook(settings, format, response, wordCount, tabId) {
  const url = (settings.webhookUrl || '').trim();
  if (!url) return;
  let title = response.title;

  // Scrub likely secrets from any free-text fields before they leave the
  // machine. background.js's webhook payload doesn't carry full chat content
  // today (see below), but the title can be arbitrary text copied from the
  // page, so it's still worth passing through the scrubber.
  if (settings.scrubSecrets !== false) {
    const { cleaned, findings } = redactSecrets(title || '');
    title = cleaned;
    if (findings.length > 0 && tabId != null) {
      const types = [...new Set(findings.map(f => f.type))].join(', ');
      const key   = findings.length === 1 ? 'contentToastRedactedOne' : 'contentToastRedactedOther';
      api.tabs.sendMessage(tabId, {
        action:  'showToast',
        text:    api.i18n.getMessage(key, [String(findings.length), types]),
        variant: 'info',
      }).catch(() => {});
    }
  }

  const record = {
    source:       'inkpour',
    id:           Date.now().toString(),
    title,
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
  let md = buildMarkdown(response.messages, response.title, response.site, gistSettings, sourceUrl);
  let description = response.title;
  const gistFilename = filename + '.md';

  // Scrub likely secrets (API keys, tokens, emails, ...) before the content
  // leaves the machine, unless the user has explicitly disabled this.
  if (settings.scrubSecrets !== false) {
    const bodyResult  = redactSecrets(md);
    const titleResult = redactSecrets(description);
    md          = bodyResult.cleaned;
    description = titleResult.cleaned;
    const allFindings = [...bodyResult.findings, ...titleResult.findings];
    if (allFindings.length > 0) {
      const types = [...new Set(allFindings.map(f => f.type))].join(', ');
      const key   = allFindings.length === 1 ? 'contentToastRedactedOne' : 'contentToastRedactedOther';
      await api.tabs.sendMessage(tab.id, {
        action:  'showToast',
        text:    api.i18n.getMessage(key, [String(allFindings.length), types]),
        variant: 'info',
      }).catch(() => {});
    }
  }

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
        description,
        public:      settings.gistPublic === true,
        files: { [gistFilename]: { content: md } },
      }),
    });
  } catch {
    await api.tabs.sendMessage(tab.id, {
      action: 'showToast', text: api.i18n.getMessage('contentToastGistFailedNetwork'), variant: 'error',
    }).catch(() => {});
    return;
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody.message || `HTTP ${res.status}`;
    await api.tabs.sendMessage(tab.id, {
      action: 'showToast', text: api.i18n.getMessage('contentToastGistFailed', [msg]), variant: 'error',
    }).catch(() => {});
    return;
  }
  const gist = await res.json();
  api.tabs.create({ url: gist.html_url });
  await api.tabs.sendMessage(tab.id, {
    action: 'showToast', text: api.i18n.getMessage('contentToastGistCreated'), variant: 'success',
  }).catch(() => {});
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────
// Chrome caps manifest.json's "commands" to 4 entries with a pre-suggested
// default keybinding (5+ triggers "Too many shortcuts specified... Could not
// load manifest" and the WHOLE extension fails to load in Chrome — unlike
// Firefox, which has no such cap). "upload-gist" lost its suggested_key for
// that reason. Its Alt+Shift+G hotkey still works via a content-script
// keydown listener (src/content.js) that sends a 'runShortcutCommand'
// runtime message here instead of going through chrome.commands — see
// runCommand() below, shared by both paths.

async function runCommand(command) {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  let response;
  try {
    // Same "Extracting…" feedback as the in-page FAB and context-menu paths
    // — keyboard shortcuts fire the export instantly with no visible UI at
    // all otherwise.
    api.tabs.sendMessage(tab.id, { action: 'showToast', text: api.i18n.getMessage('popupStatusExtracting') }).catch(() => {});
    response = await api.tabs.sendMessage(tab.id, { action: 'extract' });
  } catch {
    return; // not a supported page
  }

  if (!response?.messages?.length) return;

  // Load user settings so keyboard shortcuts respect all preferences
  const stored   = await api.storage.local.get('inkpour_settings');
  const settings = Object.assign(
    { yamlFrontMatter: false, generateTOC: false, filenameTemplate: '{platform}-{title}', downloadSubfolder: '', obsidianVault: '', obsidianTags: false, scrubSecrets: true },
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
    doWebhook(settings, 'gist', response, wordCount, tab.id);
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
  if (fmt) doWebhook(settings, fmt, response, wordCount, tab.id);
}

api.commands.onCommand.addListener((command) => { runCommand(command); });

// Fallback trigger for commands that don't fit Chrome's 4-shortcut cap
// (see comment above runCommand). content.js listens for the raw key
// combo itself and just tells us which command to run.
api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === 'runShortcutCommand' && msg.command) {
    runCommand(msg.command);
    sendResponse({ ok: true });
    return true;
  }
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
  'meta.ai', 'www.meta.ai',
  'chat.mistral.ai',
  'huggingface.co',
  'poe.com',
  'notebooklm.google.com',
  'kagi.com',
  'chat.z.ai',
  'venice.ai',
  'arena.ai', 'lmarena.ai', 'chat.lmsys.org',
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
