/**
 * background.js — Inkpour service worker
 * Handles keyboard shortcut commands without needing the popup open.
 */

const api = (typeof browser !== 'undefined') ? browser : chrome;

// ─── Keyboard shortcuts ───────────────────────────────────────────────────

api.commands.onCommand.addListener(async (command) => {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  let response;
  try {
    response = await api.tabs.sendMessage(tab.id, { action: 'extract' });
  } catch {
    return; // not a supported page
  }

  if (!response?.messages?.length) return;

  if (command === 'export-markdown') {
    const md  = buildMarkdown(response.messages, response.title, response.site);
    const url = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(md);
    api.downloads.download({ url, filename: response.filename + '.md', saveAs: false });
  }

  if (command === 'copy-markdown') {
    // Service workers don't have clipboard access — send to content script to copy
    const md = buildMarkdown(response.messages, response.title, response.site);
    await api.tabs.sendMessage(tab.id, { action: 'copyToClipboard', text: md });
  }
});

// ─── Markdown builder (mirrors popup.js — keep in sync) ──────────────────

function buildMarkdown(messages, title, site) {
  const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
  let md = `# ${title}\n\n`;
  md += `> Exported from **${site}** on ${date}\n\n---\n\n`;
  for (const { role, content } of messages) {
    md += `## ${role}\n\n${content.trim()}\n\n---\n\n`;
  }
  return md;
}
