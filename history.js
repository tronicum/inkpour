/**
 * history.js — Inkpour Export History
 * Reads inkpour_history from storage.local and renders a re-downloadable list.
 */

(function () {
  'use strict';

  const api = (typeof browser !== 'undefined') ? browser : chrome;

  const historyList     = document.getElementById('historyList');
  const emptyState      = document.getElementById('emptyState');
  const countLabel      = document.getElementById('countLabel');
  const clearBtn        = document.getElementById('clearBtn');
  const clearStarredBtn = document.getElementById('clearStarredBtn');
  const searchBox       = document.getElementById('searchBox');

  // All loaded entries — filtering operates on this
  let allEntries   = [];
  let starredIds   = new Set();   // IDs of starred entries
  let starredStore = [];          // Full starred records from inkpour_starred

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
    'zip':       'ZIP',
    'gist':      'Gist',
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

  // ─── Star toggle ───────────────────────────────────────────────────────────

  async function toggleStar(entry) {
    const isStarred = starredIds.has(entry.id);
    if (isStarred) {
      starredIds.delete(entry.id);
      starredStore = starredStore.filter(r => r.id !== entry.id);
    } else {
      starredIds.add(entry.id);
      // Store the full record (deduped)
      if (!starredStore.find(r => r.id === entry.id)) {
        starredStore.unshift(entry);
      }
    }
    await api.storage.local.set({ inkpour_starred: starredStore });
    applyFilter(searchBox?.value ?? '');
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  function renderEntry(entry, { inStarredSection = false } = {}) {
    const el = document.createElement('div');
    el.className = 'entry';
    if (inStarredSection) el.classList.add('entry-starred');

    const icon = PLATFORM_ICON[entry.platform] ?? '💬';
    const fmtLabel = FORMAT_LABEL[entry.format] ?? entry.format.toUpperCase();
    const fmtClass = `format-${entry.format}`;
    const when = formatRelativeTime(entry.exportedAt);
    const words = entry.wordCount ? `~${entry.wordCount.toLocaleString()} words` : '';
    const msgs  = entry.messageCount ? `${entry.messageCount} msgs` : '';
    const stats = [msgs, words].filter(Boolean).join(' · ');

    const isCopy     = entry.format.startsWith('copy-');
    const isGist     = entry.format === 'gist';
    const hasContent = !!entry.content;
    const isStarred  = starredIds.has(entry.id);
    const starLabel  = isStarred ? '★' : '☆';
    const starTitle  = isStarred ? 'Unpin from starred' : 'Pin to starred';

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
        <button class="btn-action star-btn ${isStarred ? 'starred' : ''}" data-action="star" title="${starTitle}">${starLabel}</button>
        ${isGist && entry.gistUrl
          ? `<a class="btn-action" href="${entry.gistUrl}" target="_blank" rel="noopener" style="text-decoration:none">↗ Gist</a>`
          : hasContent && !isCopy ? `<button class="btn-action" data-action="download">↓ Save</button>` : ''}
        ${hasContent ? `<button class="btn-action secondary" data-action="copy">⎘ Copy</button>` : ''}
      </div>`;

    el.querySelector('[data-action="star"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleStar(entry);
    });
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

  function matchesQuery(entry, q) {
    return entry.title.toLowerCase().includes(q) ||
           (entry.platform || '').toLowerCase().includes(q) ||
           (entry.format || '').toLowerCase().includes(q);
  }

  function renderSection(label, entries, inStarredSection) {
    if (!entries.length) return;
    const heading = document.createElement('div');
    heading.className = 'section-heading';
    heading.textContent = label;
    historyList.appendChild(heading);
    for (const entry of entries) {
      historyList.appendChild(renderEntry(entry, { inStarredSection }));
    }
  }

  function applyFilter(query) {
    const q = query.trim().toLowerCase();

    // Starred entries not in recent (to avoid duplicates)
    const recentIds = new Set(allEntries.map(e => e.id));
    const starredOnly  = starredStore.filter(e => !recentIds.has(e.id));
    const starredInRecent = allEntries.filter(e => starredIds.has(e.id));

    const filteredStarredOnly  = q ? starredOnly.filter(e  => matchesQuery(e, q)) : starredOnly;
    const filteredStarredRecent= q ? starredInRecent.filter(e => matchesQuery(e, q)) : starredInRecent;
    const filteredRecent       = q
      ? allEntries.filter(e => !starredIds.has(e.id) && matchesQuery(e, q))
      : allEntries.filter(e => !starredIds.has(e.id));

    const totalStarred  = filteredStarredOnly.length + filteredStarredRecent.length;
    const totalFiltered = totalStarred + filteredRecent.length;
    const totalAll      = starredOnly.length + allEntries.length;

    historyList.innerHTML = '';
    if (totalFiltered === 0 && totalAll === 0) {
      emptyState.hidden = false;
      countLabel.textContent = 'No exports yet';
      return;
    }
    if (totalFiltered === 0 && q) {
      emptyState.hidden = false;
      countLabel.textContent = `0 of ${totalAll} match`;
      return;
    }

    emptyState.hidden = true;
    countLabel.textContent = q
      ? `${totalFiltered} of ${totalAll} exports`
      : `${totalAll} export${totalAll !== 1 ? 's' : ''}`;

    // Starred section (pinned-only first, then starred-recent)
    if (totalStarred > 0) {
      renderSection('★ Starred', [...filteredStarredOnly, ...filteredStarredRecent], true);
    }
    // Recent section
    if (filteredRecent.length > 0) {
      if (totalStarred > 0) renderSection('Recent', filteredRecent, false);
      else for (const entry of filteredRecent) historyList.appendChild(renderEntry(entry));
    }
  }

  // ─── Stats ─────────────────────────────────────────────────────────────────

  function renderStats(entries) {
    const statsBar = document.getElementById('statsBar');
    if (!statsBar || entries.length === 0) {
      if (statsBar) statsBar.hidden = true;
      return;
    }
    statsBar.hidden = false;

    // Total exports
    document.getElementById('statExports').textContent = entries.length;

    // Total words
    const totalWords = entries.reduce((sum, e) => sum + (e.wordCount || 0), 0);
    document.getElementById('statWords').textContent =
      totalWords > 0 ? '~' + totalWords.toLocaleString() : '—';

    // Top platform
    const platFreq = {};
    for (const e of entries) {
      if (e.platform) platFreq[e.platform] = (platFreq[e.platform] || 0) + 1;
    }
    const topPlat = Object.entries(platFreq).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('statPlatform').textContent = topPlat ? topPlat[0] : '—';

    // Top format
    const fmtFreq = {};
    for (const e of entries) {
      const f = e.format || 'unknown';
      fmtFreq[f] = (fmtFreq[f] || 0) + 1;
    }
    const topFmt = Object.entries(fmtFreq).sort((a, b) => b[1] - a[1])[0];
    const fmtDisplay = topFmt ? (FORMAT_LABEL[topFmt[0]] ?? topFmt[0].toUpperCase()) : '—';
    document.getElementById('statFormat').textContent = fmtDisplay;
  }

  // ─── Load and display ──────────────────────────────────────────────────────

  // ─── Lifetime stats footer ────────────────────────────────────────────────

  async function renderLifetimeStats() {
    const result  = await api.storage.local.get('inkpour_lifetime_stats');
    const ls      = result?.inkpour_lifetime_stats;
    const footer  = document.querySelector('footer');
    if (!ls || !footer || ls.exports === 0) return;
    const wordsNote = ls.words > 0 ? ` · ~${ls.words.toLocaleString()} words` : '';
    const note = document.createElement('div');
    note.style.marginTop = '8px';
    note.style.fontSize  = '11px';
    note.style.color     = 'var(--subtext)';
    note.textContent = `All time: ${ls.exports} export${ls.exports !== 1 ? 's' : ''}${wordsNote}`;
    footer.appendChild(note);
  }

  // ─── Load and display ──────────────────────────────────────────────────────

  async function loadHistory() {
    const result = await api.storage.local.get(['inkpour_history', 'inkpour_starred']);
    allEntries   = result?.inkpour_history ?? [];
    starredStore = result?.inkpour_starred ?? [];
    starredIds   = new Set(starredStore.map(r => r.id));

    clearBtn.disabled   = allEntries.length === 0;
    clearBtn.textContent = starredStore.length > 0 ? 'Clear recent' : 'Clear all';
    clearBtn.title      = starredStore.length > 0
      ? 'Clear recent history (starred exports are kept)'
      : 'Clear all export history';
    if (clearStarredBtn) clearStarredBtn.hidden = starredStore.length === 0;
    renderStats([...allEntries, ...starredStore.filter(e => !new Set(allEntries.map(x=>x.id)).has(e.id))]);
    applyFilter(searchBox?.value ?? '');
    renderLifetimeStats().catch(() => {});
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  searchBox?.addEventListener('input', () => applyFilter(searchBox.value));

  // ─── Clear ─────────────────────────────────────────────────────────────────

  clearBtn.addEventListener('click', async () => {
    const hasStarred = starredStore.length > 0;
    const msg = hasStarred
      ? 'Clear recent history? Starred exports will be kept.'
      : 'Clear all export history? This cannot be undone.';
    if (!confirm(msg)) return;
    await api.storage.local.remove('inkpour_history');
    allEntries = [];
    clearBtn.disabled    = true;
    clearBtn.textContent = starredStore.length > 0 ? 'Clear recent' : 'Clear all';
    if (searchBox) searchBox.value = '';
    starredIds = new Set(starredStore.map(r => r.id));
    renderStats(starredStore);
    applyFilter('');
  });

  // ─── Clear starred ─────────────────────────────────────────────────────────

  clearStarredBtn?.addEventListener('click', async () => {
    if (!confirm('Remove all starred exports? This cannot be undone.')) return;
    await api.storage.local.remove('inkpour_starred');
    starredStore = [];
    starredIds   = new Set();
    if (clearStarredBtn) clearStarredBtn.hidden = true;
    applyFilter(searchBox?.value ?? '');
    renderStats(allEntries);
  });

  // ─── Init ──────────────────────────────────────────────────────────────────

  loadHistory().catch(console.error);

})();
