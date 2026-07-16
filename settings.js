(function () {
  'use strict';

  const api = (typeof browser !== 'undefined') ? browser : chrome;
  const t = (key, subs) => (typeof InkpourI18n !== 'undefined' ? InkpourI18n : window.InkpourI18n).t(key, subs);
  (typeof InkpourI18n !== 'undefined' ? InkpourI18n : window.InkpourI18n).applyI18n(document);
  (typeof InkpourI18n !== 'undefined' ? InkpourI18n : window.InkpourI18n).applyDirection(document);

  // ─── Browser detection ────────────────────────────────────────────────────

  const BROWSER_META = {
    firefox: { icon: '🦊', name: t('settingsBrowserFirefoxName'), note: t('settingsBrowserFirefoxNote') },
    chrome:  { icon: '🌐', name: t('settingsBrowserChromeName'),  note: t('settingsBrowserChromeNote') },
    edge:    { icon: '🌀', name: t('settingsBrowserEdgeName'),    note: t('settingsBrowserEdgeNote') },
    safari:  { icon: '🧭', name: t('settingsBrowserSafariName'),  note: t('settingsBrowserSafariNote') },
    unknown: { icon: '🌐', name: t('settingsBrowserUnknownName'), note: t('settingsBrowserUnknownNote') },
  };

  function detectBrowser() {
    if (typeof browser !== 'undefined' && typeof browser.runtime.getBrowserInfo === 'function') {
      return 'firefox';
    }
    const ua = navigator.userAgent;
    if (ua.includes('Edg/'))         return 'edge';
    if (navigator.brave?.isBrave)    return 'chrome';
    if (ua.includes('Chrome/'))      return 'chrome';
    if (ua.includes('Safari/'))      return 'safari';
    return 'unknown';
  }

  const detected = detectBrowser();
  const meta     = BROWSER_META[detected];

  document.getElementById('browserIcon').textContent = meta.icon;
  document.getElementById('browserName').textContent = meta.name;
  document.getElementById('browserNote').textContent = meta.note;

  // ─── Language override ───────────────────────────────────────────────────
  // Populate the picker with every shipped locale plus a leading "auto"
  // option (empty value = follow the browser's own language, the default).
  // Selecting a language fetches+caches its messages.json (via
  // InkpourI18n.setLanguageOverride) and reloads so the change is visible
  // immediately across this page; picking "auto" again clears the override.
  const i18n = (typeof InkpourI18n !== 'undefined' ? InkpourI18n : window.InkpourI18n);
  const languageSelect = document.getElementById('languageOverride');

  if (languageSelect) {
    const autoOption = document.createElement('option');
    autoOption.value = '';
    autoOption.textContent = t('settingsLanguageAuto');
    languageSelect.appendChild(autoOption);

    i18n.SUPPORTED_LOCALES.forEach(({ code, name }) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = name;
      languageSelect.appendChild(opt);
    });

    languageSelect.value = i18n.getLanguageOverride();

    languageSelect.addEventListener('change', () => {
      i18n.setLanguageOverride(languageSelect.value).then(() => {
        location.reload();
      });
    });
  }

  // ─── Load saved prefs ────────────────────────────────────────────────────

  const DEFAULTS = {
    defaultFormat:    'md',
    filenameTemplate: '{platform}-{title}',
    pdfAutoPrint:     true,
    yamlFrontMatter:  false,
    generateTOC:      false,
    downloadSubfolder: '',
    obsidianVault:     '',
    obsidianTags:      false,
    githubToken:          '',
    gistPublic:           false,
    gistTags:             '',
    scrubSecrets:          true,
    webhookUrl:           '',
    webhookIncludeContent: false,
    debugMode:             false,
    debugAttachGist:       false,
  };

  api.storage.local.get('inkpour_settings', (result) => {
    const prefs = Object.assign({}, DEFAULTS, result.inkpour_settings ?? {});
    document.getElementById('defaultFormat').value      = prefs.defaultFormat;
    document.getElementById('filenameTemplate').value   = prefs.filenameTemplate;
    document.getElementById('pdfAutoPrint').checked     = prefs.pdfAutoPrint;
    document.getElementById('yamlFrontMatter').checked  = prefs.yamlFrontMatter;
    document.getElementById('generateTOC').checked      = prefs.generateTOC;
    document.getElementById('downloadSubfolder').value  = prefs.downloadSubfolder;
    document.getElementById('obsidianVault').value      = prefs.obsidianVault || '';
    document.getElementById('obsidianTags').checked     = prefs.obsidianTags;
    document.getElementById('githubToken').value             = prefs.githubToken;
    document.getElementById('gistPublic').value              = String(prefs.gistPublic);
    document.getElementById('gistTags').value                = prefs.gistTags || '';
    document.getElementById('scrubSecrets').checked           = prefs.scrubSecrets;
    document.getElementById('webhookUrl').value              = prefs.webhookUrl;
    document.getElementById('webhookIncludeContent').checked = prefs.webhookIncludeContent;
    document.getElementById('debugMode').checked             = prefs.debugMode;
    document.getElementById('debugAttachGist').checked        = prefs.debugAttachGist;
    toggleDevToolsField(prefs.debugMode);
  });

  // ─── Local debug/fuzzing tools (debug/ — not present in packaged builds) ──
  // Reacts live to the checkbox rather than waiting for Save, since it's just
  // a visibility toggle with nothing to persist until you actually hit Save.

  function toggleDevToolsField(show) {
    const field = document.getElementById('devToolsField');
    if (!field) return;
    field.hidden = !show;
    field.style.display = show ? 'flex' : 'none';
  }

  document.getElementById('debugMode')?.addEventListener('change', (e) => {
    toggleDevToolsField(e.target.checked);
  });

  document.getElementById('openImportDebugLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    api.tabs.create({ url: api.runtime.getURL('debug/import-debug.html') });
  });

  document.getElementById('openPdfFuzzerLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    api.tabs.create({ url: api.runtime.getURL('debug/import-pdf-fuzzer.html') });
  });

  // ─── Save ─────────────────────────────────────────────────────────────────

  document.getElementById('saveBtn').addEventListener('click', () => {
    const prefs = {
      defaultFormat:    document.getElementById('defaultFormat').value,
      filenameTemplate: document.getElementById('filenameTemplate').value.trim() || DEFAULTS.filenameTemplate,
      pdfAutoPrint:     document.getElementById('pdfAutoPrint').checked,
      yamlFrontMatter:  document.getElementById('yamlFrontMatter').checked,
      generateTOC:      document.getElementById('generateTOC').checked,
      downloadSubfolder: document.getElementById('downloadSubfolder').value.trim(),
      obsidianVault:     document.getElementById('obsidianVault').value.trim(),
      obsidianTags:      document.getElementById('obsidianTags').checked,
      githubToken:           document.getElementById('githubToken').value.trim(),
      gistPublic:            document.getElementById('gistPublic').value === 'true',
      gistTags:              document.getElementById('gistTags').value.trim(),
      scrubSecrets:          document.getElementById('scrubSecrets').checked,
      webhookUrl:            document.getElementById('webhookUrl').value.trim(),
      webhookIncludeContent: document.getElementById('webhookIncludeContent').checked,
      debugMode:             document.getElementById('debugMode').checked,
      debugAttachGist:       document.getElementById('debugAttachGist').checked,
    };
    api.storage.local.set({ inkpour_settings: prefs }, () => {
      const el = document.getElementById('saveStatus');
      el.textContent = t('settingsSavedStatus');
      setTimeout(() => { el.textContent = ''; }, 2000);
    });
  });

})();
