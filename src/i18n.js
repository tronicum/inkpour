/**
 * i18n.js — Inkpour
 * Tiny shared helper that localizes static markup using the WebExtension
 * i18n API (chrome.i18n.getMessage / browser.i18n.getMessage).
 *
 * Usage in HTML:
 *   <p data-i18n="popupTagline"></p>
 *   <button data-i18n-title="popupSettingsTitle" data-i18n-aria-label="popupSettingsTitle"></button>
 *   <input data-i18n-placeholder="popupTitleInputPlaceholder">
 *
 * Include this script before the page's own script and call applyI18n()
 * once at load (each page does this itself so timing matches its own init).
 */
(function (root) {
  'use strict';

  const api = (typeof browser !== 'undefined') ? browser : chrome;

  // Locales in this extension's _locales/ directory that read right-to-left.
  const RTL_LANGS = ['ar', 'fa'];

  // Single source of truth for every locale this extension ships, with each
  // language's own endonym (so it's recognizable even if the picker itself is
  // currently rendered in a different language). Kept here so settings.js and
  // the jsdom test suite both read from one place instead of duplicating it.
  const SUPPORTED_LOCALES = [
    { code: 'en',    name: 'English' },
    { code: 'de',    name: 'Deutsch' },
    { code: 'zh_CN', name: '简体中文' },
    { code: 'zh_TW', name: '繁體中文' },
    { code: 'es',    name: 'Español' },
    { code: 'hi',    name: 'हिन्दी' },
    { code: 'ar',    name: 'العربية' },
    { code: 'pt_BR', name: 'Português (Brasil)' },
    { code: 'ru',    name: 'Русский' },
    { code: 'ja',    name: '日本語' },
    { code: 'fr',    name: 'Français' },
    { code: 'id',    name: 'Bahasa Indonesia' },
    { code: 'vi',    name: 'Tiếng Việt' },
    { code: 'ko',    name: '한국어' },
    { code: 'tr',    name: 'Türkçe' },
    { code: 'it',    name: 'Italiano' },
    { code: 'fa',    name: 'فارسی' },
    { code: 'pl',    name: 'Polski' },
    { code: 'uk',    name: 'Українська' },
    { code: 'bn',    name: 'বাংলা' },
    { code: 'nl',    name: 'Nederlands' },
    { code: 'th',    name: 'ไทย' },
    { code: 'pa',    name: 'ਪੰਜਾਬੀ' },
    { code: 'sv',    name: 'Svenska' },
    { code: 'cs',    name: 'Čeština' },
    { code: 'el',    name: 'Ελληνικά' },
  ];

  // ─── Manual language override ────────────────────────────────────────────
  // Default behavior (no override) is unchanged: chrome.i18n.getMessage()
  // resolves against whatever language the browser's own UI is set to. If
  // the user picks a language in Settings, we cache that locale's whole
  // messages.json in localStorage (synchronous, same-origin, already used
  // elsewhere in this codebase for inkpour_print) so every extension page
  // can check it synchronously on load — no async init step needed anywhere
  // that calls t()/applyI18n(). Picking "auto" again just clears the cache.
  const OVERRIDE_LANG_KEY = 'inkpour_language_override';
  const OVERRIDE_CACHE_KEY = 'inkpour_language_override_cache';

  function getLanguageOverride() {
    try { return localStorage.getItem(OVERRIDE_LANG_KEY) || ''; } catch { return ''; }
  }

  /** Returns the cached messages object for the current override, or null if none/invalid. */
  function getOverrideMessages() {
    try {
      const lang = localStorage.getItem(OVERRIDE_LANG_KEY);
      if (!lang) return null;
      const raw = localStorage.getItem(OVERRIDE_CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      return cached && cached.lang === lang ? cached.messages : null;
    } catch { return null; }
  }

  /**
   * Sets (or clears, when langCode is falsy/'auto') the manual language
   * override. Fetches and caches the target locale's messages.json once;
   * returns a Promise so callers (Settings' save handler) can await it and
   * then re-render. Clearing reverts to native browser auto-detection.
   */
  function setLanguageOverride(langCode) {
    if (!langCode || langCode === 'auto') {
      try {
        localStorage.removeItem(OVERRIDE_LANG_KEY);
        localStorage.removeItem(OVERRIDE_CACHE_KEY);
      } catch { /* ignore */ }
      return Promise.resolve();
    }
    return fetch(api.runtime.getURL(`_locales/${langCode}/messages.json`))
      .then(res => res.json())
      .then(messages => {
        localStorage.setItem(OVERRIDE_LANG_KEY, langCode);
        localStorage.setItem(OVERRIDE_CACHE_KEY, JSON.stringify({ lang: langCode, messages }));
      });
  }

  /**
   * Look up a message key, falling back to the key itself if missing (dev
   * aid). When a manual override is active this reimplements the native
   * chrome.i18n.getMessage() substitution algorithm by hand (since the
   * override path reads messages.json directly instead of going through the
   * browser API): named placeholders like "$PLATFORM$" are resolved first via
   * the message's own "placeholders" map (e.g. { platform: { content: "$1" } }),
   * then plain "$1"/"$2" tokens are substituted directly. Some catalog keys
   * (e.g. popupLastExport) use named placeholders exclusively, so skipping
   * this step left them completely unsubstituted under an active override.
   */
  function t(key, subs) {
    if (!key) return '';
    const override = getOverrideMessages();
    if (override) {
      const entry = override[key];
      if (entry?.message) {
        let msg = entry.message;
        const subsArr = Array.isArray(subs) ? subs : (subs != null ? [subs] : []);
        if (entry.placeholders) {
          for (const [name, def] of Object.entries(entry.placeholders)) {
            const contentM = /^\$(\d+)$/.exec(def?.content || '');
            if (!contentM) continue;
            const idx   = +contentM[1] - 1;
            const value = subsArr[idx] != null ? String(subsArr[idx]) : '';
            msg = msg.split('$' + name.toUpperCase() + '$').join(value);
          }
        }
        subsArr.forEach((sub, i) => { msg = msg.split('$' + (i + 1)).join(String(sub)); });
        return msg;
      }
      return key;
    }
    const msg = api.i18n.getMessage(key, subs);
    return msg || key;
  }

  /** Walk `root` (default: whole document) and localize every data-i18n* node. */
  function applyI18n(scope) {
    const doc = scope || document;

    doc.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    doc.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    doc.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
    });
    doc.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
  }

  /**
   * Sets <html dir="rtl"|"ltr"> based on the active language — the manual
   * override if one is set, otherwise the browser's own UI language (the
   * same language chrome.i18n.getMessage() resolves strings against).
   * Mirrors layout for the two RTL locales this extension ships: Arabic and
   * Persian.
   */
  function applyDirection(scope) {
    const doc = scope || document;
    let lang = getLanguageOverride();
    if (!lang) {
      try { lang = (api.i18n.getUILanguage() || 'en').toLowerCase(); } catch { lang = 'en'; }
    }
    const isRTL = RTL_LANGS.some(code => lang === code || lang.startsWith(code + '-'));
    doc.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    doc.documentElement.lang = lang;
  }

  const InkpourI18n = {
    t,
    applyI18n,
    applyDirection,
    getLanguageOverride,
    setLanguageOverride,
    SUPPORTED_LOCALES,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = InkpourI18n;
  } else {
    root.InkpourI18n = InkpourI18n;
  }
})(typeof self !== 'undefined' ? self : this);
