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
  const zipBtn      = document.getElementById('zipBtn');
  const gistBtn     = document.getElementById('gistBtn');
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

  // ─── Load user settings ───────────────────────────────────────────────────

  // ─── Extraction cache ─────────────────────────────────────────────────────
  // Populated by the eager peek on popup open. All export buttons reuse this
  // so the DOM is only crawled once per popup session.
  let cachedData = null;

  const SETTING_DEFAULTS = {
    defaultFormat:      'md',
    yamlFrontMatter:    false,
    generateTOC:        false,
    filenameTemplate:   '{platform}-{title}',
    downloadSubfolder:  '',   // e.g. "AI Chats" or "Obsidian/Exports"
    obsidianTags:       false, // add tags: [ai-chat, {platform}] to YAML
    githubToken:           '',
    gistPublic:            false,
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
    const codeNote = codeBlocks > 0 ? ` · ${codeBlocks} code block${codeBlocks !== 1 ? 's' : ''}` : '';
    setStatus(`Ready · ${n} message${n !== 1 ? 's' : ''}${roleNote} · ~${words.toLocaleString()} words · ~${readMin} min read${codeNote}`);
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

  // Wire the toggle
  notesToggle?.addEventListener('click', () => {
    const open = notesSection && !notesSection.hidden;
    if (notesSection) {
      notesSection.hidden = !open ? false : true;
      notesSection.style.display = !open ? 'block' : 'none';
    }
    if (notesToggle) notesToggle.textContent = !open ? '− Hide notes' : '+ Add notes';
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
      setStatus('Extracting…');
      hideTitleInput();
      const response = await api.tabs.sendMessage(tab.id, { action: 'extract' });
      if (response?.error && !response.streaming) {
        setStatus(response.error, 'error');
        return;
      }
      if (response?.streaming) {
        setStatus('AI is still generating — export after it finishes', 'warning');
        return;
      }
      if (response?.messages?.length) {
        response.sourceUrl = tab.url || '';
        cachedData = response;
        updatePeekStatus(response);
        showTitleInput(response.title);
        showNotesToggle();
      } else {
        clearStatus();
      }
    } catch {
      // Not a supported page or content script not ready — stay silent
      clearStatus();
    }
  }

  // Status bar acts as a "Refresh" button — click to re-extract
  status?.addEventListener('click', async () => {
    cachedData = null;
    await runPeek();
  });

  runPeek();

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
      const notes = getExportNotes();
      const md   = notesBlockMD(notes) + buildMarkdown(data.messages, data.title, data.site, userSettings, data.sourceUrl);
      downloadFile(md, buildFilename(userSettings.filenameTemplate, data.platform, data.filename, data.sourceUrl, countWords(data.messages)) + '.md', 'text/markdown;charset=utf-8');
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
      const data     = await extractFromPage();
      const fullHTML = buildStandaloneHTML(data.messages, data.title, data.site);
      downloadFile(fullHTML, buildFilename(userSettings.filenameTemplate, data.platform, data.filename, data.sourceUrl, countWords(data.messages)) + '.html', 'text/html;charset=utf-8');
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
      const data  = await extractFromPage();
      const notes = getExportNotes();
      const md    = notesBlockMD(notes) + buildMarkdown(data.messages, data.title, data.site, userSettings, data.sourceUrl);
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
      const data     = await extractFromPage();
      const fullHTML = buildStandaloneHTML(data.messages, data.title, data.site);
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
      const data  = await extractFromPage();
      const notes = getExportNotes();
      let json = buildJSON(data.messages, data.title, data.site, data.platform);
      // Inject notes field after the top-level exportedAt key if present
      if (notes) {
        try {
          const obj = JSON.parse(json);
          obj.notes = notes;
          json = JSON.stringify(obj, null, 2);
        } catch { /* leave json as-is if parse fails */ }
      }
      downloadFile(json, buildFilename(userSettings.filenameTemplate, data.platform, data.filename, data.sourceUrl, countWords(data.messages)) + '.json', 'application/json;charset=utf-8');
      setStatus('✓ Saved — check your Downloads folder', 'success');
      saveLastExport('json', data, json);
    } catch (err) {
      setStatus(err.message, err.streaming ? 'warning' : 'error');
    } finally {
      setLoading(jsonBtn, false);
    }
  });

  // ─── ZIP export ──────────────────────────────────────────────────────────

  zipBtn?.addEventListener('click', async () => {
    clearStatus();
    setLoading(zipBtn, true);
    try {
      const data = await extractFromPage();
      const { files, codeCount } = buildZipExport(
        data.messages, data.title, data.site, userSettings, data.sourceUrl
      );
      const zipBytes = buildZip(files);
      const blob     = new Blob([zipBytes], { type: 'application/zip' });
      const url      = URL.createObjectURL(blob);
      const a        = Object.assign(document.createElement('a'), {
        href:     url,
        download: withSubfolder(buildFilename(userSettings.filenameTemplate, data.platform, data.filename, data.sourceUrl, countWords(data.messages)) + '.zip'),
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const note = codeCount > 0 ? ` + ${codeCount} code file${codeCount !== 1 ? 's' : ''}` : '';
      setStatus(`✓ ZIP saved — chat.md${note}`, 'success');
      saveLastExport('zip', data, ''); // content not stored (binary)
    } catch (err) {
      setStatus(err.message, err.streaming ? 'warning' : 'error');
    } finally {
      setLoading(zipBtn, false);
    }
  });

  // ─── GitHub Gist upload ───────────────────────────────────────────────────

  gistBtn?.addEventListener('click', async () => {
    if (!userSettings.githubToken) {
      setStatus('Add a GitHub token in Settings first.', 'warning');
      return;
    }
    if (gistLinkEl) gistLinkEl.innerHTML = '';
    clearStatus();
    setLoading(gistBtn, true);
    try {
      const data  = await extractFromPage();
      const notes = getExportNotes();
      const md    = notesBlockMD(notes) + buildMarkdown(data.messages, data.title, data.site, userSettings, data.sourceUrl);
      const slug  = buildFilename(userSettings.filenameTemplate, data.platform, data.filename, data.sourceUrl, countWords(data.messages));
      const filename = slug + '.md';

      setStatus('Uploading to GitHub Gist…');
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
      setStatus('✓ Gist created', 'success');
      if (gistLinkEl) {
        gistLinkEl.innerHTML = `<a href="${gist.html_url}" target="_blank" rel="noopener">${gist.html_url}</a>`;
      }
      saveLastExport('gist', data, md, { gistUrl: gist.html_url });
    } catch (err) {
      setStatus(err.message || 'Gist upload failed', 'error');
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
      throw new Error('Cannot access the current tab.');
    }

    let response;
    // Show progress hint — auto-scroll can take up to 4 s on long chats
    setStatus('Extracting messages…');
    try {
      response = await api.tabs.sendMessage(tab.id, { action: 'extract' });
    } catch {
      throw new Error('Refresh the chat tab, then try again. (Content script not running — tab was open before the extension loaded.)');
    }
    clearStatus();

    if (!response)              throw new Error('No response from page. Try refreshing the tab.');
    if (response.streaming)     throw Object.assign(new Error(response.error), { streaming: true });
    if (response.error)         throw new Error(response.error);
    if (!response.messages?.length) throw new Error('No messages found.');

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
      lastExportEl.textContent =
        `Last: ${data.platform} · ${data.messages.length} msgs · ${fmtLabel} · just now`;
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
