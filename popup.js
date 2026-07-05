/**
 * popup.js — Chat to Markdown
 * Sends a message to the content script, receives Markdown, triggers download.
 */

(function () {
  'use strict';

  const btn    = document.getElementById('exportBtn');
  const status = document.getElementById('status');

  btn.addEventListener('click', async () => {
    setStatus('', '');
    setLoading(true);

    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

      let response;
      try {
        response = await browser.tabs.sendMessage(tab.id, { action: 'exportMarkdown' });
      } catch {
        // Content script not injected — happens on unsupported pages or before first load
        setStatus(
          'Navigate to a supported AI chat page and make sure the conversation has loaded.',
          'error'
        );
        return;
      }

      if (!response) {
        setStatus('No response from page. Try refreshing the tab.', 'error');
        return;
      }

      if (response.error) {
        setStatus(response.error, 'error');
        return;
      }

      // Trigger download
      downloadMarkdown(response.markdown, response.filename ?? 'chat-export.md');
      setStatus('✓ Exported — check your Downloads folder', 'success');

    } catch (err) {
      setStatus(`Unexpected error: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  });

  function downloadMarkdown(text, filename) {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    // Small delay before revoking so Firefox has time to start the download
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setLoading(on) {
    btn.disabled = on;
    btn.classList.toggle('loading', on);
    btn.querySelector('span').textContent = on ? 'Exporting…' : 'Export to Markdown';
  }

  function setStatus(message, type) {
    status.textContent  = message;
    status.className    = type; // '', 'success', or 'error'
  }

})();
