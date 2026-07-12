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

  /** Look up a message key, falling back to the key itself if missing (dev aid). */
  function t(key, subs) {
    if (!key) return '';
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
   * Sets <html dir="rtl"|"ltr"> based on the browser's current UI language
   * (the same language chrome.i18n.getMessage() is already resolving strings
   * against — there's no separate "pick a language" step, this just mirrors
   * layout for the two RTL locales this extension ships: Arabic and Persian).
   */
  function applyDirection(scope) {
    const doc = scope || document;
    let lang = 'en';
    try { lang = (api.i18n.getUILanguage() || 'en').toLowerCase(); } catch { /* default to ltr */ }
    const isRTL = RTL_LANGS.some(code => lang === code || lang.startsWith(code + '-'));
    doc.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    doc.documentElement.lang = lang;
  }

  const InkpourI18n = { t, applyI18n, applyDirection };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = InkpourI18n;
  } else {
    root.InkpourI18n = InkpourI18n;
  }
})(typeof self !== 'undefined' ? self : this);
