(function () {
  try {
    console.log('[Inkpour print.html] script running');

    const html = localStorage.getItem('inkpour_print');
    console.log('[Inkpour print.html] localStorage value length:', html ? html.length : 'null');
    localStorage.removeItem('inkpour_print');

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

  } catch (err) {
    console.error('[Inkpour print.html] error:', err);
    document.getElementById('page').innerHTML =
      `<p style="color:red"><strong>Inkpour error:</strong> ${err.message}</p>`;
  }
})();
