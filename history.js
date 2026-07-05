/**
 * history.js — Inkpour Export History
 * Reads inkpour_history from storage.local and renders a re-downloadable list.
 */

(function () {
  'use strict';

  const api = (typeof browser !== 'undefined') ? browser : chrome;

  const historyList = document.getElementById('historyList');
  const emptyState  = document.getElementById('emptyState');
  const countLabel  = document.getElementById('countLabel');
  const clearBtn    = document.getElementById('clearBtn');
  const searchBox   = document.getElementById('searchBox');

  // All loaded entries — filtering operates on this
  let allEntries = [];

  // ─── Platform icons ────────────────────────────────────────────────────────

  const PLATFORM_ICON = {
    chatgpt:    '🟢',
    claude:     '🟠',
    gemini:     '🔵',
    aistudio:   '🔵',
    copilot:    '🔷',
    grok:       '⚡',
    perplexity: '🔍',
    deepseek:   '🌊',
    metaai:     '🤖',
    mistral:    '🌪',
    huggingchat:'🤗',
    poe:        '🐉',
    phind:      '🔎',
    notebooklm: '📓',
    kagi:       '🦅',
    generic:    '💬',
  };

  // ─── Relative time ─────────────────────────────────────────────────────────

  function formatRelativeTime(isoString) {
    const diff    = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1)  return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)   return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7)     return `${days}d ago`;
    return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // ─── Format display ────────────────────────────────────────────────────────

  const FORMAT_LABEL = {
    'md':        'MD',
    'pdf':       'PDF',
    'html':      'HTML',
    'json':      'JSON',
    'copy-md':   'Copy MD',
    'copy-html': 'Copy HTML',
  };

  // ─── Download / re-export ──────────────────────────────────────────────────

  function downloadContent(entry) {
    const mimeMap = {
      md:   'text/markdown;charset=utf-8',
      html: 'text/html;charset=utf-8',
      json: 'application/json;charset=utf-8',
    };
    const extMap = { md: '.md', html: '.html', json: '.json', pdf: '.html' };
    const fmt = entry.format.replace('copy-', '');

    if (fmt === 'pdf') {
      // Re-open the print page using the stored HTML body
      localStorage.setItem('inkpour_print', entry.content);
      window.open(api.runtime.getURL('print.html'), '_blank');
      return;
    }

    const mime = mimeMap[fmt] ?? 'text/plain;charset=utf-8';
    const ext  = extMap[fmt]  ?? '.txt';
    const blob = new Blob([entry.content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: (entry.slug || entry.title.slice(0, 60).replace(/[^a-z0-9]+/gi, '-')) + ext,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyContent(entry) {
    try {
      await navigator.clipboard.writeText(entry.content);
    } catch {
      // fallback — create a textarea and execCommand
      const ta = document.createElement('textarea');
      ta.value = entry.content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  function renderEntry(entry) {
    const el = document.createElement('div');
    el.className = 'entry';

    const icon = PLATFORM_ICON[entry.platform] ?? '💬';
    const fmtLabel = FORMAT_LABEL[entry.format] ?? entry.format.toUpperCase();
    const fmtClass = `format-${entry.format}`;
    const when = formatRelativeTime(entry.exportedAt);
    const words = entry.wordCount ? `~${entry.wordCount.toLocaleString()} words` : '';
    const msgs  = entry.messageCount ? `${entry.messageCount} msgs` : '';
    const stats = [msgs, words].filter(Boolean).join(' · ');

    const isCopy = entry.format.startsWith('copy-');
    const hasContent = !!entry.content;

    el.innerHTML = `
      <div class="entry-icon">${icon}</div>
      <div class="entry-meta">
        <div class="entry-title" title="${entry.title.replace(/"/g, '&quot;')}">${entry.title}</div>
        <div class="entry-details">
          <span class="badge">${entry.platform}</span>
          <span class="badge ${fmtClass}">${fmtLabel}</span>
          ${stats ? `<span>${stats}</span>` : ''}
          <span>${when}</span>
        </div>
      </div>
      <div class="entry-actions">
        ${hasContent && !isCopy ? `<button class="btn-action" data-action="download">↓ Save</button>` : ''}
        ${hasContent ? `<button class="btn-action secondary" data-action="copy">⎘ Copy</button>` : ''}
      </div>`;

    el.querySelector('[data-action="download"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadContent(entry);
    });
    el.querySelector('[data-action="copy"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await copyContent(entry);
      const btn = e.currentTarget;
      const orig = btn.textContent;
      btn.textContent = '✓ Copied';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });

    return el;
  }

  // ─── Filter and render ─────────────────────────────────────────────────────

  function applyFilter(query) {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? allEntries.filter(e =>
          e.title.toLowerCase().includes(q) ||
          (e.platform || '').toLowerCase().includes(q) ||
          (e.format || '').toLowerCase().includes(q)
        )
      : allEntries;

    historyList.innerHTML = '';
    if (filtered.length === 0) {
      emptyState.hidden = false;
      countLabel.textContent = q
        ? `0 of ${allEntries.length} match`
        : 'No exports yet';
    } else {
      emptyState.hidden = true;
      countLabel.textContent = q
        ? `${filtered.length} of ${allEntries.length} exports`
        : `${allEntries.length} export${allEntries.length !== 1 ? 's' : ''}`;
      for (const entry of filtered) {
        historyList.appendChild(renderEntry(entry));
      }
    }
  }

  // ─── Load and display ──────────────────────────────────────────────────────

  async function loadHistory() {
    const result = await api.storage.local.get('inkpour_history');
    allEntries = result?.inkpour_history ?? [];

    clearBtn.disabled = allEntries.length === 0;
    applyFilter(searchBox?.value ?? '');
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  searchBox?.addEventListener('input', () => applyFilter(searchBox.value));

  // ─── Clear ─────────────────────────────────────────────────────────────────

  clearBtn.addEventListener('click', async () => {
    if (!confirm('Clear all export history? This cannot be undone.')) return;
    await api.storage.local.remove('inkpour_history');
    allEntries = [];
    historyList.innerHTML = '';
    emptyState.hidden = false;
    countLabel.textContent = 'No exports yet';
    clearBtn.disabled = true;
    if (searchBox) searchBox.value = '';
  });

  // ─── Init ──────────────────────────────────────────────────────────────────

  loadHistory().catch(console.error);

})();
