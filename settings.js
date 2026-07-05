(function () {
  'use strict';

  const api = (typeof browser !== 'undefined') ? browser : chrome;

  // ─── Browser detection ────────────────────────────────────────────────────

  const BROWSER_META = {
    firefox: { icon: '🦊', name: 'Firefox',          note: 'Full support — all export formats' },
    chrome:  { icon: '🌐', name: 'Chrome / Brave',   note: 'Full support — all export formats' },
    edge:    { icon: '🌀', name: 'Microsoft Edge',   note: 'Full support — all export formats' },
    safari:  { icon: '🧭', name: 'Safari',           note: 'Experimental — PDF may behave differently' },
    unknown: { icon: '🌐', name: 'Unknown browser',  note: 'May work — report issues if something breaks' },
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

  // ─── Load saved prefs ────────────────────────────────────────────────────

  const DEFAULTS = {
    defaultFormat:    'md',
    filenameTemplate: '{platform}-{title}',
    pdfAutoPrint:     true,
    yamlFrontMatter:  false,
    generateTOC:      false,
    downloadSubfolder: '',
    obsidianTags:      false,
    githubToken:          '',
    gistPublic:           false,
    gistTags:             '',
    webhookUrl:           '',
    webhookIncludeContent: false,
  };

  api.storage.local.get('inkpour_settings', (result) => {
    const prefs = Object.assign({}, DEFAULTS, result.inkpour_settings ?? {});
    document.getElementById('defaultFormat').value      = prefs.defaultFormat;
    document.getElementById('filenameTemplate').value   = prefs.filenameTemplate;
    document.getElementById('pdfAutoPrint').checked     = prefs.pdfAutoPrint;
    document.getElementById('yamlFrontMatter').checked  = prefs.yamlFrontMatter;
    document.getElementById('generateTOC').checked      = prefs.generateTOC;
    document.getElementById('downloadSubfolder').value  = prefs.downloadSubfolder;
    document.getElementById('obsidianTags').checked     = prefs.obsidianTags;
    document.getElementById('githubToken').value             = prefs.githubToken;
    document.getElementById('gistPublic').value              = String(prefs.gistPublic);
    document.getElementById('gistTags').value                = prefs.gistTags || '';
    document.getElementById('webhookUrl').value              = prefs.webhookUrl;
    document.getElementById('webhookIncludeContent').checked = prefs.webhookIncludeContent;
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
      obsidianTags:      document.getElementById('obsidianTags').checked,
      githubToken:           document.getElementById('githubToken').value.trim(),
      gistPublic:            document.getElementById('gistPublic').value === 'true',
      gistTags:              document.getElementById('gistTags').value.trim(),
      webhookUrl:            document.getElementById('webhookUrl').value.trim(),
      webhookIncludeContent: document.getElementById('webhookIncludeContent').checked,
    };
    api.storage.local.set({ inkpour_settings: prefs }, () => {
      const el = document.getElementById('saveStatus');
      el.textContent = '✓ Saved';
      setTimeout(() => { el.textContent = ''; }, 2000);
    });
  });

})();
