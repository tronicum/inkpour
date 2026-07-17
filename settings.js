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
    notionToken:          '',
    notionPageId:         '',
    scrubSecrets:          true,
    webhookUrl:           '',
    webhookIncludeContent: false,
    writeToVault:          false,
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
    document.getElementById('notionToken').value              = prefs.notionToken || '';
    document.getElementById('notionPageId').value             = prefs.notionPageId || '';
    document.getElementById('scrubSecrets').checked           = prefs.scrubSecrets;
    document.getElementById('webhookUrl').value              = prefs.webhookUrl;
    document.getElementById('webhookIncludeContent').checked = prefs.webhookIncludeContent;
    document.getElementById('writeToVault').checked           = prefs.writeToVault;
    document.getElementById('debugMode').checked             = prefs.debugMode;
    document.getElementById('debugAttachGist').checked        = prefs.debugAttachGist;
    toggleDevToolsField(prefs.debugMode);
    initVaultSection(prefs.writeToVault);
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

  // ─── Direct-to-vault (File System Access API — Chrome/Edge only) ─────────
  // Feature-detected once here: `showDirectoryPicker` doesn't exist in
  // Firefox or Safari, so the whole section is left `hidden` (not just
  // disabled — it must not appear at all) and none of the code below runs
  // for those browsers. Firefox/Safari users see exactly the same Export
  // section as before this feature existed. The directory handle itself is
  // persisted via src/vaultHandle.js (IndexedDB — chrome.storage.local can't
  // hold a FileSystemDirectoryHandle, only JSON).

  const vaultSection      = document.getElementById('vaultSection');
  const vaultFolderNameEl = document.getElementById('vaultFolderName');
  const chooseVaultBtn    = document.getElementById('chooseVaultBtn');
  const forgetVaultBtn    = document.getElementById('forgetVaultBtn');
  const writeToVaultField = document.getElementById('writeToVaultField');
  const writeToVaultBox   = document.getElementById('writeToVault');

  const hasFSA = typeof window.showDirectoryPicker === 'function';

  function showVaultFolder(name) {
    vaultFolderNameEl.textContent = t('settingsVaultFolderChosenPrefix', [name]);
    if (forgetVaultBtn) { forgetVaultBtn.hidden = false; forgetVaultBtn.style.display = 'inline-block'; }
    if (writeToVaultField) { writeToVaultField.hidden = false; writeToVaultField.style.display = 'flex'; }
  }

  function clearVaultFolderUI() {
    vaultFolderNameEl.textContent = t('settingsVaultNoFolderChosen');
    if (forgetVaultBtn) { forgetVaultBtn.hidden = true; forgetVaultBtn.style.display = 'none'; }
    if (writeToVaultField) { writeToVaultField.hidden = true; writeToVaultField.style.display = 'none'; }
    if (writeToVaultBox) writeToVaultBox.checked = false;
  }

  async function initVaultSection(writeToVaultPref) {
    if (!vaultSection) return;
    if (!hasFSA) {
      vaultSection.hidden = true;
      vaultSection.style.display = 'none';
      return;
    }
    vaultSection.hidden = false;
    vaultSection.style.display = 'block';

    try {
      const handle = await getVaultHandle();
      if (handle) {
        showVaultFolder(handle.name);
        if (writeToVaultBox) writeToVaultBox.checked = !!writeToVaultPref;
      } else {
        clearVaultFolderUI();
      }
    } catch {
      clearVaultFolderUI();
    }
  }

  chooseVaultBtn?.addEventListener('click', async () => {
    // showDirectoryPicker() must be called directly off this click gesture —
    // no other await ahead of it. Requesting 'readwrite' mode up front means
    // the picker itself grants readwrite permission for this session, so
    // there's nothing else to request right after picking.
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await setVaultHandle(handle);
      showVaultFolder(handle.name);
      save();
    } catch (err) {
      // AbortError = user dismissed the picker — not an error worth surfacing.
      if (err?.name === 'AbortError') return;
      const el = document.getElementById('saveStatus');
      el.textContent = t('popupVaultPermissionDenied');
    }
  });

  forgetVaultBtn?.addEventListener('click', async () => {
    try {
      await clearVaultHandle();
    } catch { /* best-effort */ }
    clearVaultFolderUI();
    save();
  });

  // ─── Save (autosave) ──────────────────────────────────────────────────────
  // Every field persists on its own change instead of waiting for the Save
  // button: checkboxes/selects save immediately on 'change', text fields
  // debounce ~450ms on 'input' so we're not hitting storage on every
  // keystroke. This is the standard pattern for extension options pages and
  // removes the "changed something, forgot to scroll down and click Save"
  // failure mode entirely. The button still works — it flushes any pending
  // debounce and saves right away — but it's now a convenience, not the only
  // way changes get persisted.

  let statusTimer = null;

  function save() {
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
      notionToken:           document.getElementById('notionToken').value.trim(),
      notionPageId:          document.getElementById('notionPageId').value.trim(),
      scrubSecrets:          document.getElementById('scrubSecrets').checked,
      webhookUrl:            document.getElementById('webhookUrl').value.trim(),
      webhookIncludeContent: document.getElementById('webhookIncludeContent').checked,
      writeToVault:          document.getElementById('writeToVault').checked,
      debugMode:             document.getElementById('debugMode').checked,
      debugAttachGist:       document.getElementById('debugAttachGist').checked,
    };
    api.storage.local.set({ inkpour_settings: prefs }, () => {
      const el = document.getElementById('saveStatus');
      el.textContent = t('settingsSavedStatus');
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => { el.textContent = ''; }, 2000);
    });
  }

  const AUTOSAVE_DEBOUNCE_MS = 450;
  let debounceTimer = null;
  function debouncedSave() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(save, AUTOSAVE_DEBOUNCE_MS);
  }

  // Discrete controls (checkboxes/selects): save immediately, no debounce.
  [
    'defaultFormat', 'pdfAutoPrint', 'yamlFrontMatter', 'generateTOC',
    'obsidianTags', 'gistPublic', 'scrubSecrets', 'webhookIncludeContent',
    'writeToVault', 'debugMode', 'debugAttachGist',
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', save);
  });

  // Free-text fields: debounce so we're not saving mid-keystroke.
  [
    'filenameTemplate', 'downloadSubfolder', 'obsidianVault', 'githubToken',
    'gistTags', 'notionToken', 'notionPageId', 'webhookUrl',
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', debouncedSave);
  });

  document.getElementById('saveBtn').addEventListener('click', () => {
    clearTimeout(debounceTimer);
    save();
  });

})();
