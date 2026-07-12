/**
 * popup.js — Inkpour
 * Coordinates extraction (via content script) and export (MD download / PDF tab).
 */

(function () {
  'use strict';

  const api = (typeof browser !== 'undefined') ? browser : chrome;
  const t = (key, subs) => (typeof InkpourI18n !== 'undefined' ? InkpourI18n : window.InkpourI18n).t(key, subs);
  (typeof InkpourI18n !== 'undefined' ? InkpourI18n : window.InkpourI18n).applyI18n(document);
  (typeof InkpourI18n !== 'undefined' ? InkpourI18n : window.InkpourI18n).applyDirection(document);

  const mdBtn       = document.getElementById('mdBtn');
  const pdfBtn      = document.getElementById('pdfBtn');
  const htmlBtn     = document.getElementById('htmlBtn');
  const copyBtn     = document.getElementById('copyBtn');
  const copyHtmlBtn = document.getElementById('copyHtmlBtn');
  const jsonBtn     = document.getElementById('jsonBtn');
  const docxBtn     = document.getElementById('docxBtn');
  const zipBtn      = document.getElementById('zipBtn');
  const gistBtn     = document.getElementById('gistBtn');
  const allBtn      = document.getElementById('allBtn');
  const settingsBtn  = document.getElementById('settingsBtn');
  const historyBtn   = document.getElementById('historyBtn');
  const settingsBtn2 = document.getElementById('settingsBtn2');
  const status        = document.getElementById('status');
  const titleInput    = document.getElementById('titleInput');
  const notesToggle   = document.getElementById('notesToggle');
  const notesSection  = document.getElementById('notes-section');
  const notesInput    = document.getElementById('notesInput');
  const gistLinkEl    = document.getElementById('gist-link');
  const lastExportEl  = document.getElementById('last-export');
  const newMsgsHint   = document.getElementById('new-msgs-hint');
  const incrementalHint    = document.getElementById('incrementalHint');
  const incrementalExportBtn = document.getElementById('incrementalExportBtn');
  const selectToggle  = document.getElementById('selectToggle');
  const selectSection = document.getElementById('select-section');
  const selectCount   = document.getElementById('selectCount');
  const msgCheckboxes = document.getElementById('msgCheckboxes');
  const selectAllBtn  = document.getElementById('selectAll');
  const selectNoneBtn = document.getElementById('selectNone');
  const selectUserBtn = document.getElementById('selectUser');
  const selectAIBtn   = document.getElementById('selectAI');
  const importBtn         = document.getElementById('importBtn');
  const importSection     = document.getElementById('import-section');
  const importText        = document.getElementById('importText');
  const importTitleInput  = document.getElementById('importTitleInput');
  const importError       = document.getElementById('importError');
  const importSubmitBtn   = document.getElementById('importSubmitBtn');
  const importCancelBtn   = document.getElementById('importCancelBtn');

  // ─── Load user settings ───────────────────────────────────────────────────

  // ─── Extraction cache ─────────────────────────────────────────────────────
  // Populated by the eager peek on popup open. All export buttons reuse this
  // so the DOM is only crawled once per popup session.
  let cachedData = null;

  // Most recent history entry matching the current tab's URL, when the
  // conversation has grown since that export (see checkNewMessagesSince).
  // Used by the "Export new only" button to know where to slice from.
  let incrementalPrevEntry = null;

  const SETTING_DEFAULTS = {
    defaultFormat:      'md',
    yamlFrontMatter:    false,
    generateTOC:        false,
    filenameTemplate:   '{platform}-{title}',
    downloadSubfolder:  '',   // e.g. "AI Chats" or "Obsidian/Exports"
    obsidianTags:       false, // add tags: [ai-chat, {platform}] to YAML
    githubToken:           '',
    gistPublic:            false,
    gistTags:              '', // comma-separated extra tags for Gist YAML (e.g. "work, project-x")
    webhookUrl:            '',
    webhookIncludeContent: false,
  };
  let userSettings = { ...SETTING_DEFAULTS };

  api.storage.local.get('inkpour_settings', (result) => {
    userSettings = Object.assign({}, SETTING_DEFAULTS, result?.inkpour_settings ?? {});
    // Highlight default format button
    const btnMap = { md: mdBtn, pdf: pdfBtn, html: htmlBtn, json: jsonBtn, zip: zipBtn };
    const defaultBtn = btnMap[userSettings.defaultFormat];
    if (defaultBtn) defaultBtn.classList.add('default-format');
    // Show Gist button only when a token is configured
    if (gistBtn && userSettings.githubToken) gistBtn.hidden = false;
  });

  // ─── Platform indicator — single line replacing the old chip list ────────

  const CHIP_HOSTS = {
    'ChatGPT':        ['chatgpt.com', 'chat.openai.com'],
    'Claude':         ['claude.ai'],
    'Gemini':         ['gemini.google.com'],
    'AI Studio':      ['aistudio.google.com'],
    'Google Search':  ['www.google.com', 'google.com'],
    'Copilot':        ['copilot.microsoft.com', 'copilot.com'],
    'Grok':           ['grok.com'],
    'Groq':           ['console.groq.com'],
    'Perplexity':     ['perplexity.ai'],
    'DeepSeek':       ['chat.deepseek.com'],
    'Meta AI':        ['meta.ai'],
    'Mistral':        ['chat.mistral.ai'],
    'HuggingChat':    ['huggingface.co'],
    'Poe':            ['poe.com'],
    'Phind':          ['phind.com'],
    'NotebookLM':     ['notebooklm.google.com'],
    'Kagi':           ['kagi.com'],
    'Z.ai':           ['chat.z.ai'],
    'Venice':         ['venice.ai'],
    'Chatbot Arena':  ['lmarena.ai', 'chat.lmsys.org'],
    'Character.AI':   ['character.ai', 'www.character.ai'],
    'Cohere Coral':   ['coral.cohere.com'],
    'Pi':             ['pi.ai'],
  };

  // Flat set of all supported hostnames — used to distinguish "wrong site" from
  // "right site but content script not loaded yet" when extraction fails.
  const SUPPORTED_HOST_FLAT = Object.values(CHIP_HOSTS).flat();

  function isSupportedHost(url) {
    try {
      const { hostname } = new URL(url);
      return SUPPORTED_HOST_FLAT.some(h => hostname === h || hostname.endsWith('.' + h));
    } catch { return false; }
  }

  const platformIndicator = document.getElementById('platformIndicator');

  (async () => {
    try {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !platformIndicator) return;
      const url = new URL(tab.url);
      for (const [name, hosts] of Object.entries(CHIP_HOSTS)) {
        if (hosts.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
          platformIndicator.textContent = t('popupPlatformDetected', [name]);
          platformIndicator.classList.add('detected');
          return;
        }
      }
      // Not a supported page — show subtle count
      platformIndicator.textContent = t('popupPlatformCount', [String(Object.keys(CHIP_HOSTS).length)]);
    } catch {
      // permission error or non-URL tab — leave blank
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
      lastExportEl.textContent = t('popupLastExport', [last.platform, String(last.messageCount), fmt, when]);
    } catch {
      // storage unavailable — ignore
    }
  })();

  // ─── Message count peek ───────────────────────────────────────────────────
  // Eagerly extract on popup open, cache the result, show chat stats.
  // All export buttons reuse cachedData — no duplicate DOM crawl per popup session.

  function updatePeekStatus(data) {
    const msgs  = data.messages;
    const n     = msgs.length;
    const words = countWords(msgs);
    const readMin    = Math.max(1, Math.round(words / 200));
    const userCount  = msgs.filter(m => m.role === 'user').length;
    const aiCount    = msgs.filter(m => m.role !== 'user').length;
    const codeBlocks = msgs.reduce((sum, m) => {
      const matches = m.content.match(/```[\s\S]*?```/g);
      return sum + (matches ? matches.length : 0);
    }, 0);
    const roleNote = ` · ${userCount}u/${aiCount}a`;
    const codeNote = codeBlocks > 0
      ? t(codeBlocks === 1 ? 'popupCodeBlockOne' : 'popupCodeBlockOther', [String(codeBlocks)])
      : '';
    const key = n === 1 ? 'popupMsgCountOne' : 'popupMsgCountOther';
    setStatus(t(key, [String(n), roleNote, words.toLocaleString(), String(readMin), codeNote]));
  }

  function showTitleInput(title) {
    if (!titleInput) return;
    titleInput.value = title;
    titleInput.style.display = 'block';
    titleInput.hidden = false;
  }

  function hideTitleInput() {
    if (!titleInput) return;
    titleInput.style.display = 'none';
    titleInput.hidden = true;
  }

  /** Show the notes toggle button (appears after extraction). */
  function showNotesToggle() {
    if (!notesToggle) return;
    notesToggle.style.display = 'block';
    notesToggle.hidden = false;
  }

  /** Return user-entered notes (empty string if none). */
  function getExportNotes() {
    return (notesInput?.value || '').trim();
  }

  // ─── Selective export ────────────────────────────────────────────────────────

  /** Show the "Select messages" toggle after extraction. */
  function showSelectToggle() {
    if (!selectToggle) return;
    selectToggle.style.display = 'block';
    selectToggle.hidden = false;
  }

  /** Populate the checkbox list from the current cachedData messages. */
  function buildMessageSelector(messages) {
    if (!msgCheckboxes) return;
    msgCheckboxes.textContent = '';
    messages.forEach((msg, i) => {
      const isUser = msg.role.toLowerCase() === 'you' || msg.role.toLowerCase() === 'user';
      const preview = msg.content.replace(/\s+/g, ' ').slice(0, 72);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.idx = String(i);
      checkbox.checked = true;
      checkbox.addEventListener('change', updateSelectCount);

      const roleSpan = document.createElement('span');
      roleSpan.className = `msg-role ${isUser ? 'user' : 'ai'}`;
      roleSpan.textContent = msg.role.slice(0, 6); // role text comes from the extracted page, not UI chrome

      const previewSpan = document.createElement('span');
      previewSpan.className = 'msg-preview';
      previewSpan.textContent = preview;

      const row = document.createElement('label');
      row.className = 'msg-row';
      row.append(checkbox, roleSpan, previewSpan);
      msgCheckboxes.appendChild(row);
    });
    updateSelectCount();
  }

  function updateSelectCount() {
    if (!msgCheckboxes || !selectCount) return;
    const all     = msgCheckboxes.querySelectorAll('input[type=checkbox]');
    const checked = msgCheckboxes.querySelectorAll('input[type=checkbox]:checked');
    selectCount.textContent = t('popupSelectCount', [String(checked.length), String(all.length)]);
  }

  /**
   * Return the subset of messages currently checked.
   * Falls back to all messages if the selector is hidden or all are checked.
   */
  function getSelectedMessages(allMessages) {
    if (!selectSection || selectSection.hidden) return allMessages;
    const boxes = msgCheckboxes?.querySelectorAll('input[type=checkbox]') ?? [];
    if (!boxes.length) return allMessages;
    const selected = [];
    boxes.forEach((box, i) => {
      if (box.checked && allMessages[i]) selected.push(allMessages[i]);
    });
    return selected.length ? selected : allMessages;
  }

  // Quick-select helpers
  function setCheckboxes(predicate, messages) {
    const boxes = msgCheckboxes?.querySelectorAll('input[type=checkbox]') ?? [];
    boxes.forEach((box, i) => {
      box.checked = predicate(messages[i], i);
    });
    updateSelectCount();
  }

  selectToggle?.addEventListener('click', () => {
    const open = selectSection && !selectSection.hidden;
    if (selectSection) {
      selectSection.hidden = open;
      selectSection.style.display = open ? 'none' : 'block';
    }
    if (selectToggle) selectToggle.textContent = t(open ? 'popupSelectToggleOpen' : 'popupSelectToggleClose');
  });

  selectAllBtn?.addEventListener('click',  () => setCheckboxes(() => true,  cachedData?.messages ?? []));
  selectNoneBtn?.addEventListener('click', () => setCheckboxes(() => false, cachedData?.messages ?? []));
  selectUserBtn?.addEventListener('click', () => setCheckboxes(m => {
    const r = (m.role || '').toLowerCase();
    return r === 'you' || r === 'user';
  }, cachedData?.messages ?? []));
  selectAIBtn?.addEventListener('click',   () => setCheckboxes(m => {
    const r = (m.role || '').toLowerCase();
    return r !== 'you' && r !== 'user';
  }, cachedData?.messages ?? []));

  // Wire the toggle
  notesToggle?.addEventListener('click', () => {
    const open = notesSection && !notesSection.hidden;
    if (notesSection) {
      notesSection.hidden = !open ? false : true;
      notesSection.style.display = !open ? 'block' : 'none';
    }
    if (notesToggle) notesToggle.textContent = t(!open ? 'popupNotesToggleHide' : 'popupNotesToggleAdd');
  });

  /** Return user-edited title if the field is visible, otherwise the original. */
  function getEffectiveTitle(originalTitle) {
    if (titleInput && !titleInput.hidden && titleInput.value.trim()) {
      return titleInput.value.trim();
    }
    return originalTitle;
  }

  async function runPeek() {
    try {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      setStatus(t('popupStatusExtracting'));
      hideTitleInput();
      if (newMsgsHint) { newMsgsHint.hidden = true; newMsgsHint.style.display = 'none'; }
      hideIncrementalHint();
      const response = await api.tabs.sendMessage(tab.id, { action: 'extract' });
      if (response?.error && !response.streaming) {
        setStatus(response.error, 'error');
        return;
      }
      if (response?.streaming) {
        setStatus(t('popupStatusAiStillGenerating'), 'warning');
        return;
      }
      if (response?.messages?.length) {
        response.sourceUrl = tab.url || '';
        cachedData = response;
        updatePeekStatus(response);
        showTitleInput(response.title);
        showNotesToggle();
        showSelectToggle();
        buildMessageSelector(response.messages);
        checkNewMessagesSince(tab.url, response.messages.length);
      } else {
        clearStatus();
      }
    } catch {
      // Not a supported page or content script not ready — stay silent
      clearStatus();
    }
  }

  // Status bar acts as a "Refresh" button — click to re-extract. An explicit
  // refresh means "give up on the pending import, get me the live page"
  // (there's nothing else it could mean if the popup is showing imported
  // data on a page that isn't a supported chat), so drop the persisted
  // import state too.
  status?.addEventListener('click', async () => {
    cachedData = null;
    await clearImportState();
    await runPeek();
  });

  // A pending import survives popup close/reopen (see "Import from
  // clipboard" below) and takes priority on load — only fall back to a live
  // page peek when there's nothing pending.
  (async () => {
    const pending = await loadImportState();
    if (pending?.messages?.length) {
      restoreImportState(pending);
    } else {
      runPeek();
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

  // ─── Import from clipboard ────────────────────────────────────────────────
  // Low-tech alternative to live capture: paste a conversation copied from
  // elsewhere (e.g. a mobile chat app's text, saved via Apple Notes/iCloud)
  // and it's parsed into the same {role, content} shape a live extraction
  // produces, then dropped into cachedData so every existing export button —
  // and History, once something is actually exported — works on it unchanged.
  //
  // Unlike a live page capture (which can always be re-extracted by simply
  // reopening the popup on the same tab), an imported conversation has no
  // other source to fall back to — and WebExtension popups are ephemeral,
  // closing the instant they lose focus (clicking away, switching windows,
  // even taking a screenshot). Without persisting it, the imported data would
  // vanish the moment the popup closes, forcing a re-paste. So it's also
  // written to storage.local and restored on the next popup open, taking
  // priority over a fresh live-page peek until the user explicitly imports
  // something new or clicks the status bar to force a live refresh.

  const PENDING_IMPORT_KEY = 'inkpour_pending_import';

  async function saveImportState(data) {
    try { await api.storage.local.set({ [PENDING_IMPORT_KEY]: data }); } catch { /* ignore */ }
  }

  async function loadImportState() {
    try {
      const result = await api.storage.local.get(PENDING_IMPORT_KEY);
      return result?.[PENDING_IMPORT_KEY] || null;
    } catch { return null; }
  }

  async function clearImportState() {
    try { await api.storage.local.remove(PENDING_IMPORT_KEY); } catch { /* ignore */ }
  }

  function restoreImportState(data) {
    cachedData = data;
    updatePeekStatus(cachedData);
    showTitleInput(cachedData.title);
    showNotesToggle();
    showSelectToggle();
    buildMessageSelector(cachedData.messages);
  }

  function openImportPanel() {
    if (!importSection) return;
    importSection.hidden = false;
    importSection.style.display = 'block';
    if (importError) importError.textContent = '';
    importText?.focus();
  }

  function closeImportPanel() {
    if (!importSection) return;
    importSection.hidden = true;
    importSection.style.display = 'none';
    if (importText) importText.value = '';
    if (importTitleInput) importTitleInput.value = '';
    if (importError) importError.textContent = '';
  }

  importBtn?.addEventListener('click', () => {
    const isOpen = importSection && !importSection.hidden;
    if (isOpen) closeImportPanel();
    else openImportPanel();
  });

  importCancelBtn?.addEventListener('click', closeImportPanel);

  // Prefer a rich-text (HTML) clipboard payload when one is present — copying
  // directly out of a browser tab (or any source that writes real markup to
  // the pasteboard) carries actual <table>/<strong>/<em> tags, which convert
  // to a proper Markdown table instead of the flattened, structure-less text
  // you get from a plain-text-only paste. Falls through to the browser's
  // normal plain-text paste when no HTML payload is available.
  importText?.addEventListener('paste', (event) => {
    const html = event.clipboardData?.getData('text/html');
    if (!html || !html.trim()) return; // let the default plain-text paste happen
    event.preventDefault();
    const converted = htmlPasteToMarkdown(html);
    const el    = importText;
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + converted + el.value.slice(end);
    const caret = start + converted.length;
    el.setSelectionRange(caret, caret);
  });

  importSubmitBtn?.addEventListener('click', () => {
    const raw = importText?.value || '';
    if (!raw.trim()) {
      if (importError) importError.textContent = t('popupImportEmptyError');
      return;
    }

    const messages = parseImportedText(raw);
    if (!messages.length) {
      if (importError) importError.textContent = t('popupImportEmptyError');
      return;
    }

    const title = importTitleInput?.value.trim() || t('popupImportDefaultTitle');
    const filenameSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'imported-chat';

    cachedData = {
      messages,
      title,
      site:      'Imported',
      platform:  'generic',
      filename:  filenameSlug,
      sourceUrl: '',
    };

    closeImportPanel();
    hideIncrementalHint();
    if (newMsgsHint) { newMsgsHint.hidden = true; newMsgsHint.style.display = 'none'; }

    updatePeekStatus(cachedData);
    showTitleInput(cachedData.title);
    showNotesToggle();
    showSelectToggle();
    buildMessageSelector(cachedData.messages);
    saveImportState(cachedData); // survive the popup closing before you export it

    // Land it in History immediately, the same moment a live capture would
    // if you'd clicked an export button — otherwise "appears in History" (the
    // whole point of choosing to save imports there instead of a one-shot
    // download) silently doesn't happen until you separately click a format
    // button, which isn't obvious and isn't what was promised.
    const md = buildMarkdown(cachedData.messages, cachedData.title, cachedData.site, userSettings, cachedData.sourceUrl);
    saveLastExport('md', cachedData, md);

    const count = messages.length;
    setStatus(t(count === 1 ? 'popupStatusImportedOne' : 'popupStatusImportedOther', [String(count)]), 'success');
  });

  // ─── Markdown export ─────────────────────────────────────────────────────

  mdBtn.addEventListener('click', async () => {
    clearStatus();
    setLoading(mdBtn, true);
    try {
      const data = await extractFromPage();
      const msgs  = getSelectedMessages(data.messages);
      const notes = getExportNotes();
      const md   = notesBlockMD(notes) + buildMarkdown(msgs, data.title, data.site, userSettings, data.sourceUrl);
      downloadFile(md, buildFilename(userSettings.filenameTemplate, data.platform, data.filename, data.sourceUrl, countWords(msgs), msgs.length) + '.md', 'text/markdown;charset=utf-8');
      setStatus(t('popupStatusSavedCheckDownloads'), 'success');
      saveLastExport('md', { ...data, messages: msgs }, md);
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
      const msgs        = getSelectedMessages(data.messages);
      const bodyContent = buildPrintBodyHTML(msgs, data.title, data.site);
      localStorage.setItem('inkpour_print', bodyContent);
      await api.tabs.create({ url: api.runtime.getURL('print.html') });
      saveLastExport('pdf', { ...data, messages: msgs }, bodyContent);
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
      const data     = await extractFromPage();
      const msgs     = getSelectedMessages(data.messages);
      const fullHTML = buildStandaloneHTML(msgs, data.title, data.site);
      downloadFile(fullHTML, buildFilename(userSettings.filenameTemplate, data.platform, data.filename, data.sourceUrl, countWords(msgs), msgs.length) + '.html', 'text/html;charset=utf-8');
      setStatus(t('popupStatusSavedCheckDownloads'), 'success');
      saveLastExport('html', { ...data, messages: msgs }, fullHTML);
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
      const data  = await extractFromPage();
      const msgs  = getSelectedMessages(data.messages);
      const notes = getExportNotes();
      const md    = notesBlockMD(notes) + buildMarkdown(msgs, data.title, data.site, userSettings, data.sourceUrl);
      await navigator.clipboard.writeText(md);
      setStatus(t('popupStatusMarkdownCopied'), 'success');
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
      const data     = await extractFromPage();
      const msgs     = getSelectedMessages(data.messages);
      const fullHTML = buildStandaloneHTML(msgs, data.title, data.site);
      await navigator.clipboard.writeText(fullHTML);
      setStatus(t('popupStatusHtmlCopied'), 'success');
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
      const data  = await extractFromPage();
      const msgs  = getSelectedMessages(data.messages);
      const notes = getExportNotes();
      let json = buildJSON(msgs, data.title, data.site, data.platform);
      // Inject notes field after the top-level exportedAt key if present
      if (notes) {
        try {
          const obj = JSON.parse(json);
          obj.notes = notes;
          json = JSON.stringify(obj, null, 2);
        } catch { /* leave json as-is if parse fails */ }
      }
      downloadFile(json, buildFilename(userSettings.filenameTemplate, data.platform, data.filename, data.sourceUrl, countWords(msgs), msgs.length) + '.json', 'application/json;charset=utf-8');
      setStatus(t('popupStatusSavedCheckDownloads'), 'success');
      saveLastExport('json', { ...data, messages: msgs }, json);
    } catch (err) {
      setStatus(err.message, err.streaming ? 'warning' : 'error');
    } finally {
      setLoading(jsonBtn, false);
    }
  });

  // ─── DOCX export ─────────────────────────────────────────────────────────

  docxBtn?.addEventListener('click', async () => {
    clearStatus();
    setLoading(docxBtn, true);
    try {
      const data  = await extractFromPage();
      const msgs  = getSelectedMessages(data.messages);
      const bytes = buildDocx(msgs, data.title, data.site, userSettings, data.sourceUrl);
      const blob  = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url   = URL.createObjectURL(blob);
      const a     = Object.assign(document.createElement('a'), {
        href:     url,
        download: withSubfolder(buildFilename(userSettings.filenameTemplate, data.platform, data.filename, data.sourceUrl, countWords(msgs), msgs.length) + '.docx'),
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(t('popupStatusSavedCheckDownloads'), 'success');
      saveLastExport('docx', { ...data, messages: msgs }, '');
    } catch (err) {
      setStatus(err.message, err.streaming ? 'warning' : 'error');
    } finally {
      setLoading(docxBtn, false);
    }
  });

  // ─── ZIP export ──────────────────────────────────────────────────────────

  zipBtn?.addEventListener('click', async () => {
    clearStatus();
    setLoading(zipBtn, true);
    try {
      const data = await extractFromPage();
      const msgs = getSelectedMessages(data.messages);
      const { files, codeCount } = buildZipExport(
        msgs, data.title, data.site, userSettings, data.sourceUrl
      );
      const zipBytes = buildZip(files);
      const blob     = new Blob([zipBytes], { type: 'application/zip' });
      const url      = URL.createObjectURL(blob);
      const a        = Object.assign(document.createElement('a'), {
        href:     url,
        download: withSubfolder(buildFilename(userSettings.filenameTemplate, data.platform, data.filename, data.sourceUrl, countWords(msgs), msgs.length) + '.zip'),
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const note = codeCount > 0
        ? t(codeCount === 1 ? 'popupCodeFileOne' : 'popupCodeFileOther', [String(codeCount)])
        : '';
      setStatus(t('popupStatusZipSaved') + note, 'success');
      saveLastExport('zip', { ...data, messages: msgs }, ''); // content not stored (binary)
    } catch (err) {
      setStatus(err.message, err.streaming ? 'warning' : 'error');
    } finally {
      setLoading(zipBtn, false);
    }
  });

  // ─── Export All (MD + DOCX + ZIP) ────────────────────────────────────────

  allBtn?.addEventListener('click', async () => {
    clearStatus();
    setLoading(allBtn, true);
    try {
      const data  = await extractFromPage();
      const msgs  = getSelectedMessages(data.messages);
      const notes = getExportNotes();
      const slug  = buildFilename(userSettings.filenameTemplate, data.platform, data.filename, data.sourceUrl, countWords(msgs), msgs.length);

      // Build MD
      const md = notesBlockMD(notes) + buildMarkdown(msgs, data.title, data.site, userSettings, data.sourceUrl);
      downloadFile(md, slug + '.md', 'text/markdown;charset=utf-8');

      // Build DOCX
      const docxBytes = buildDocx(msgs, data.title, data.site, userSettings, data.sourceUrl);
      const docxBlob  = new Blob([docxBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const docxUrl   = URL.createObjectURL(docxBlob);
      const docxA     = Object.assign(document.createElement('a'), {
        href:     docxUrl,
        download: withSubfolder(slug + '.docx'),
      });
      document.body.appendChild(docxA);
      docxA.click();
      document.body.removeChild(docxA);
      setTimeout(() => URL.revokeObjectURL(docxUrl), 1000);

      // Build ZIP
      const { files } = buildZipExport(msgs, data.title, data.site, userSettings, data.sourceUrl);
      const zipBytes  = buildZip(files);
      const zipBlob   = new Blob([zipBytes], { type: 'application/zip' });
      const zipUrl    = URL.createObjectURL(zipBlob);
      const zipA      = Object.assign(document.createElement('a'), {
        href:     zipUrl,
        download: withSubfolder(slug + '.zip'),
      });
      document.body.appendChild(zipA);
      zipA.click();
      document.body.removeChild(zipA);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);

      setStatus(t('popupStatusExportAllSaved'), 'success');
      saveLastExport('all', { ...data, messages: msgs }, '');
    } catch (err) {
      setStatus(err.message, err.streaming ? 'warning' : 'error');
    } finally {
      setLoading(allBtn, false);
    }
  });

  // ─── GitHub Gist upload ───────────────────────────────────────────────────

  /**
   * Renders the created gist's URL as a clickable link, plus a "Copy link"
   * button (works everywhere) and, where the platform actually supports it,
   * a "Share…" button using the standard Web Share API — this invokes the
   * real native OS share sheet (macOS NSSharingServicePicker on Safari, the
   * Windows Share flyout on Chrome/Edge) for exactly this kind of "hand off
   * a URL" case, no native messaging host or browser fork required. Desktop
   * Firefox doesn't implement navigator.share() at all, so the button is
   * simply omitted there — Copy link still covers it.
   */
  function renderGistLink(url, title) {
    if (!gistLinkEl) return;
    gistLinkEl.textContent = '';

    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = url;
    gistLinkEl.appendChild(a);

    const actions = document.createElement('div');
    actions.className = 'gist-link-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'gist-link-btn';
    copyBtn.textContent = t('popupGistCopyLinkBtn');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        setStatus(t('popupStatusGistLinkCopied'), 'success');
      } catch {
        setStatus(t('popupStatusGistUploadFailed'), 'error');
      }
    });
    actions.appendChild(copyBtn);

    if (typeof navigator.share === 'function') {
      const shareBtn = document.createElement('button');
      shareBtn.type = 'button';
      shareBtn.className = 'gist-link-btn';
      shareBtn.textContent = t('popupGistShareBtn');
      shareBtn.addEventListener('click', () => {
        // Must be called synchronously inside the click handler — browsers
        // require an active user gesture (transient activation) or this
        // throws NotAllowedError.
        navigator.share({ title, url }).catch(() => { /* user cancelled, or unsupported — ignore */ });
      });
      actions.appendChild(shareBtn);
    }

    gistLinkEl.appendChild(actions);
  }

  gistBtn?.addEventListener('click', async () => {
    if (!userSettings.githubToken) {
      setStatus(t('popupStatusGistTokenMissing'), 'warning');
      return;
    }
    if (gistLinkEl) gistLinkEl.innerHTML = '';
    clearStatus();
    setLoading(gistBtn, true);
    try {
      const data  = await extractFromPage();
      const msgs  = getSelectedMessages(data.messages);
      const notes = getExportNotes();
      // Gist exports always include YAML front matter with searchable tags so the
      // user can find them later via GitHub search (user:you "ai-chat" etc.).
      const gistSettings = {
        ...userSettings,
        yamlFrontMatter: true,
        obsidianTags:    true,
        gistExtraTags:   userSettings.gistTags || '',
      };
      const md    = notesBlockMD(notes) + buildMarkdown(msgs, data.title, data.site, gistSettings, data.sourceUrl);
      const slug  = buildFilename(userSettings.filenameTemplate, data.platform, data.filename, data.sourceUrl, countWords(msgs), msgs.length);
      const filename = slug + '.md';

      setStatus(t('popupStatusGistUploading'));
      const res = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          'Authorization': `token ${userSettings.githubToken}`,
          'Accept':        'application/vnd.github.v3+json',
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          description: data.title,
          public:      userSettings.gistPublic === true,
          files: { [filename]: { content: md } },
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `GitHub API error ${res.status}`);
      }

      const gist = await res.json();
      setStatus(t('popupStatusGistCreated'), 'success');
      if (gistLinkEl) renderGistLink(gist.html_url, data.title);
      saveLastExport('gist', { ...data, messages: msgs }, md, { gistUrl: gist.html_url });
    } catch (err) {
      setStatus(err.message || t('popupStatusGistUploadFailed'), 'error');
    } finally {
      setLoading(gistBtn, false);
    }
  });

  // ─── Shared extraction helper ─────────────────────────────────────────────

  async function extractFromPage() {
    // Return cached extraction if available, applying any user title edit
    if (cachedData) {
      const effectiveTitle = getEffectiveTitle(cachedData.title);
      if (effectiveTitle !== cachedData.title) {
        // Re-derive filename slug from custom title
        const customSlug = effectiveTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
        return { ...cachedData, title: effectiveTitle, filename: customSlug };
      }
      return cachedData;
    }

    let tab;
    try {
      [tab] = await api.tabs.query({ active: true, currentWindow: true });
    } catch {
      throw new Error(t('popupStatusCannotAccessTab'));
    }

    let response;
    // Show progress hint — auto-scroll can take up to 4 s on long chats
    setStatus(t('popupStatusExtractingMessages'));
    let scrollPollInterval = null;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
      scrollPollInterval = setInterval(async () => {
        try {
          const data = await chrome.storage.session.get(['inkpourScrolling', 'inkpourScrollMsg']);
          if (data.inkpourScrolling) setStatus(data.inkpourScrollMsg || t('popupStatusLoadingOlder'), 'info');
        } catch (_) {}
      }, 600);
    }
    try {
      response = await api.tabs.sendMessage(tab.id, { action: 'extract' });
    } catch {
      if (scrollPollInterval) { clearInterval(scrollPollInterval); scrollPollInterval = null; }
      if (!isSupportedHost(tab?.url || '')) {
        throw new Error(t('popupStatusNotSupportedPage'));
      }
      throw new Error(t('popupStatusRefreshTab'));
    }
    if (scrollPollInterval) { clearInterval(scrollPollInterval); scrollPollInterval = null; }
    clearStatus();

    if (!response)              throw new Error(t('popupStatusNoResponse'));
    if (response.streaming)     throw Object.assign(new Error(response.error), { streaming: true });
    if (response.error)         throw new Error(response.error);
    if (!response.messages?.length) throw new Error(t('popupStatusNoMessagesFound'));

    // Attach the source tab URL so exports can include it
    response.sourceUrl = tab.url || '';
    cachedData = response;
    showTitleInput(response.title);
    response.title = getEffectiveTitle(response.title);
    return response; // { messages, title, site, filename, sourceUrl }
  }

  // ─── Utilities ────────────────────────────────────────────────────────────
  // buildMarkdown, buildFilename, buildJSON, buildPrintBodyHTML,
  // buildStandaloneHTML, esc, mdToHTML, buildZip, buildZipExport,
  // uint8ToBase64, _CRC32_TABLE, _crc32, _dosDateTime, _CODE_EXT
  // → all provided by src/utils.js (loaded before this script in popup.html)
  // InkpourDiff.sliceNewMessages → provided by src/diff.js (loaded before
  // this script in popup.html), used for the "export new only" hint above.

  /**
   * Prepend the configured downloads subfolder (if any) to a bare filename.
   * The browser's Downloads API interprets slashes as subdirectory separators.
   */
  /** Approximate word count across all messages. */
  function countWords(messages) {
    return messages.reduce((sum, m) => sum + m.content.trim().split(/\s+/).filter(Boolean).length, 0);
  }

  /**
   * Wrap user notes as a Markdown blockquote block.
   * Multi-line notes get each line prefixed with "> ".
   * Returns an empty string when there are no notes.
   */
  function notesBlockMD(notes) {
    if (!notes) return '';
    const lines = notes.split('\n').map(l => `> ${l}`).join('\n');
    return `> **Notes**\n${lines}\n\n`;
  }

  function withSubfolder(filename) {
    const sub = (userSettings.downloadSubfolder || '').trim().replace(/\/+$/, '');
    return sub ? `${sub}/${filename}` : filename;
  }

  function downloadFile(text, filename, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = withSubfolder(filename);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setLoading(btn, on) {
    btn.disabled = on;
    btn.classList.toggle('loading', on);
  }

  // ─── Export persistence (last hint + rolling history) ─────────────────────

  /**
   * Persists the most recent export as a compact hint AND prepends a full
   * entry (including content) to the rolling inkpour_history array (max 20).
   *
   * @param {string} format   - 'md', 'pdf', 'html', 'json', 'copy-md', 'copy-html', 'gist'
   * @param {object} data     - { messages, title, platform, filename }
   * @param {string} content  - the actual exported string (for re-download)
   * @param {object} extras   - optional extra fields (e.g. { gistUrl })
   */
  function saveLastExport(format, data, content = '', extras = {}) {
    const wordCount = data.messages
      .map(m => m.content.trim().split(/\s+/).filter(Boolean).length)
      .reduce((a, b) => a + b, 0);

    const record = {
      id:           Date.now().toString(),
      title:        data.title,
      platform:     data.platform,
      slug:         data.filename,
      sourceUrl:    data.sourceUrl || '',
      format,
      messageCount: data.messages.length,
      wordCount,
      exportedAt:   new Date().toISOString(),
      content,      // may be empty for PDF (handled separately via localStorage)
      ...extras,    // e.g. { gistUrl: 'https://gist.github.com/...' }
    };

    // Update last-export hint
    api.storage.local.set({ inkpour_last_export: record });
    if (lastExportEl) {
      const fmtLabel = format.toUpperCase().replace('-', ' ');
      lastExportEl.textContent = t('popupLastExportJustNow', [data.platform, String(data.messages.length), fmtLabel]);
    }

    // Prepend to rolling history (max 20 entries)
    api.storage.local.get(['inkpour_history', 'inkpour_lifetime_stats']).then((result) => {
      const history = result?.inkpour_history ?? [];
      history.unshift(record);
      if (history.length > 20) history.splice(20);

      // Accumulate lifetime stats — survive rolling window truncation
      const prev  = result?.inkpour_lifetime_stats ?? { exports: 0, words: 0 };
      const stats = {
        exports: (prev.exports || 0) + 1,
        words:   (prev.words   || 0) + (record.wordCount || 0),
      };

      api.storage.local.set({ inkpour_history: history, inkpour_lifetime_stats: stats });
    }).catch(() => {});

    // Fire webhook (best-effort, non-blocking)
    doWebhook(record);
  }

  /**
   * POST export metadata (and optionally content) to the configured webhook URL.
   * Runs best-effort — errors are silently swallowed so they never break the export.
   */
  function doWebhook(record) {
    const url = (userSettings.webhookUrl || '').trim();
    if (!url) return;
    const payload = userSettings.webhookIncludeContent
      ? record
      : (({ content, ...rest }) => rest)(record); // omit content if not requested
    fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ source: 'inkpour', ...payload }),
    }).catch(() => {}); // best-effort
  }

  /**
   * Compare the current extraction against history entries for the same URL.
   * If a prior export exists for this URL, show how many messages are new.
   *
   * @param {string} currentUrl   - tab.url of the active page
   * @param {number} currentCount - message count from the fresh extraction
   */
  async function checkNewMessagesSince(currentUrl, currentCount) {
    if (!newMsgsHint || !currentUrl) return;
    try {
      const result  = await api.storage.local.get('inkpour_history');
      const history = result?.inkpour_history ?? [];
      // Find the most recent entry whose sourceUrl matches the current page
      // (history is stored newest-first, see saveLastExport, so the first
      // match is the most recent prior export for this conversation).
      const prev = history.find(e => e.sourceUrl && e.sourceUrl === currentUrl);
      if (!prev || prev.messageCount >= currentCount) {
        newMsgsHint.hidden = true;
        newMsgsHint.style.display = 'none';
        hideIncrementalHint();
        return;
      }
      const diff = currentCount - prev.messageCount;
      const when = formatRelativeTime(prev.exportedAt);
      newMsgsHint.textContent = t(diff === 1 ? 'popupNewMessageOne' : 'popupNewMessageOther', [String(diff), when]);
      newMsgsHint.hidden = false;
      newMsgsHint.style.display = 'block';

      showIncrementalHint(prev, diff, when);
    } catch {
      // storage unavailable — ignore
    }
  }

  // ─── Incremental ("export new only") hint ─────────────────────────────────

  function hideIncrementalHint() {
    incrementalPrevEntry = null;
    if (!incrementalHint) return;
    incrementalHint.hidden = true;
    incrementalHint.style.display = 'none';
  }

  function showIncrementalHint(prevEntry, diff, when) {
    incrementalPrevEntry = prevEntry;
    if (!incrementalHint) return;
    const hintText = incrementalHint.querySelector('[data-role="text"]') || incrementalHint;
    hintText.textContent = t(diff === 1 ? 'popupIncrementalHintOne' : 'popupIncrementalHintOther', [String(diff), when]);
    incrementalHint.hidden = false;
    incrementalHint.style.display = 'block';
  }

  incrementalExportBtn?.addEventListener('click', async () => {
    if (!incrementalPrevEntry || !cachedData) return;
    clearStatus();
    setLoading(incrementalExportBtn, true);
    try {
      const data = cachedData;
      const newOnly = (typeof InkpourDiff !== 'undefined' ? InkpourDiff : window.InkpourDiff).sliceNewMessages(data.messages, incrementalPrevEntry.messageCount);
      if (!newOnly.length) {
        setStatus(t('popupStatusNoNewMessages'), 'warning');
        return;
      }
      const notes = getExportNotes();
      const md = notesBlockMD(notes) + buildMarkdown(newOnly, data.title, data.site, userSettings, data.sourceUrl);
      const slug = buildFilename(userSettings.filenameTemplate, data.platform, data.filename, data.sourceUrl, countWords(newOnly), newOnly.length);
      downloadFile(md, slug + '-continued.md', 'text/markdown;charset=utf-8');
      setStatus(t(newOnly.length === 1 ? 'popupSavedNewMessagesOne' : 'popupSavedNewMessagesOther', [String(newOnly.length)]), 'success');
      // Record the checkpoint against the FULL cumulative message count (not
      // just the new slice) — future incremental diffs compare against this
      // messageCount, so it must reflect the whole conversation as it stands
      // now, even though `md`/`content` here is only the incremental export.
      saveLastExport('md', data, md);
      hideIncrementalHint();
      if (newMsgsHint) { newMsgsHint.hidden = true; newMsgsHint.style.display = 'none'; }
    } catch (err) {
      setStatus(err.message, err.streaming ? 'warning' : 'error');
    } finally {
      setLoading(incrementalExportBtn, false);
    }
  });

  /**
   * Returns a human-friendly relative time string ("just now", "5m ago", "2h ago", "3d ago").
   */
  function formatRelativeTime(isoString) {
    const diff    = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1)  return t('timeJustNow');
    if (minutes < 60) return t('timeMinutesAgo', [String(minutes)]);
    const hours = Math.floor(minutes / 60);
    if (hours < 24)   return t('timeHoursAgo', [String(hours)]);
    const days  = Math.floor(hours / 24);
    return t('timeDaysAgo', [String(days)]);
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
