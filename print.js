(function () {
  'use strict';

  const api = (typeof browser !== 'undefined') ? browser : chrome;
  const t = (key, subs) => (typeof InkpourI18n !== 'undefined' ? InkpourI18n : window.InkpourI18n).t(key, subs);
  (typeof InkpourI18n !== 'undefined' ? InkpourI18n : window.InkpourI18n).applyI18n(document);
  (typeof InkpourI18n !== 'undefined' ? InkpourI18n : window.InkpourI18n).applyDirection(document);

  /**
   * Replace #page's content with the parsed body of `htmlString` without ever
   * assigning to innerHTML directly (avoids "Unsafe assignment to innerHTML"
   * lint/AMO rejections). Parses the string in a detached document via
   * DOMParser, then moves the resulting nodes into #page.
   */
  function setPageHTML(htmlString) {
    const page = document.getElementById('page');
    if (!page) return;
    const doc = new DOMParser().parseFromString(htmlString, 'text/html');
    page.textContent = '';
    Array.from(doc.body.childNodes).forEach((node) => {
      page.appendChild(node);
    });
  }

  /**
   * Build a safe error paragraph without innerHTML. When `label` is provided
   * it's rendered bold followed by the plain-text message (e.g. "**Inkpour
   * error:** <message>"); when omitted, `message` is rendered as plain text
   * on its own (used for fully pre-composed, already-localized strings).
   */
  function renderErrorMessage(label, message) {
    const page = document.getElementById('page');
    if (!page) return;
    page.textContent = '';
    const p = document.createElement('p');
    p.style.color = 'red';
    if (label) {
      const strong = document.createElement('strong');
      strong.textContent = label;
      p.appendChild(strong);
      p.appendChild(document.createTextNode(' ' + message));
    } else {
      p.appendChild(document.createTextNode(message));
    }
    page.appendChild(p);
  }

  async function loadContent() {
    // Primary: popup sets localStorage (same extension origin, sync)
    const html = localStorage.getItem('inkpour_print');
    if (html) {
      localStorage.removeItem('inkpour_print');
      return html;
    }
    // Fallback: background service worker (no localStorage) writes to storage.local
    try {
      const result = await api.storage.local.get('inkpour_print_pending');
      const pending = result?.inkpour_print_pending ?? null;
      if (pending) {
        await api.storage.local.remove('inkpour_print_pending');
        return pending;
      }
    } catch {
      // storage unavailable — fall through
    }
    return null;
  }

  loadContent().then((html) => {
    if (!html) {
      renderErrorMessage(null, t('printNoContent'));
      return;
    }
    setPageHTML(html);
    const h1 = document.querySelector('.doc-header h1');
    if (h1) document.title = h1.textContent + ' — Inkpour';
    window.print();
  }).catch((err) => {
    console.error('[Inkpour print.html] error:', err);
    renderErrorMessage(t('printGenericErrorPrefix'), err.message);
  });
})();
