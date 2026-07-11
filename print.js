(function () {
  'use strict';

  const api = (typeof browser !== 'undefined') ? browser : chrome;

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

  // Renders an HTML string into #page without ever assigning to innerHTML.
  // DOMParser builds a detached document from the string, then its nodes
  // are moved into the live page one at a time.
  function setPageHTML(htmlString) {
    const page = document.getElementById('page');
    page.textContent = '';
    const doc = new DOMParser().parseFromString(htmlString, 'text/html');
    Array.from(doc.body.childNodes).forEach((node) => page.appendChild(node));
  }

  function showMessage(label, text) {
    const page = document.getElementById('page');
    page.textContent = '';
    const p = document.createElement('p');
    p.style.color = 'red';
    const strong = document.createElement('strong');
    strong.textContent = label;
    p.append(strong, document.createTextNode(' ' + text));
    page.appendChild(p);
  }

  loadContent().then((html) => {
    if (!html) {
      showMessage('Inkpour:', 'No content found. Try exporting again.');
      return;
    }
    setPageHTML(html);
    const h1 = document.querySelector('.doc-header h1');
    if (h1) document.title = h1.textContent + ' — Inkpour';
    window.print();
  }).catch((err) => {
    console.error('[Inkpour print.html] error:', err);
    showMessage('Inkpour error:', err.message);
  });
})();
