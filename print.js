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

  loadContent().then((html) => {
    if (!html) {
      document.getElementById('page').innerHTML =
        '<p style="color:red"><strong>Inkpour:</strong> No content found. ' +
        'Try exporting again.</p>';
      return;
    }
    document.getElementById('page').innerHTML = html;
    const h1 = document.querySelector('.doc-header h1');
    if (h1) document.title = h1.textContent + ' — Inkpour';
    window.print();
  }).catch((err) => {
    console.error('[Inkpour print.html] error:', err);
    document.getElementById('page').innerHTML =
      `<p style="color:red"><strong>Inkpour error:</strong> ${err.message}</p>`;
  });
})();
