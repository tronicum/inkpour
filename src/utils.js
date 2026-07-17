/**
 * src/utils.js — Inkpour shared utilities
 *
 * Loaded by popup.html via <script> and by background.js via importScripts().
 * All functions are declared at global scope so they work in both contexts.
 * Do NOT add anything that depends on DOM, localStorage, or extension APIs here.
 */

// ─── URL cleaning ─────────────────────────────────────────────────────────────
// Strips UTM, Google Ads, and other common tracking parameters from URLs so
// the exported source link is clean and human-readable.

const TRACKING_PARAMS = new Set([
  // UTM
  'utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id',
  // Google Ads
  'gclid','gbraid','wbraid','gad_source','gad_campaignid',
  'c_id','c_agid','c_crid','c_kwid','c_ims','c_pms','c_nw','c_dvc',
  // Facebook / Meta
  'fbclid','fb_action_ids','fb_action_types','fb_source','fb_ref',
  // Microsoft / Bing
  'msclkid',
  // Other
  'igshid','mc_cid','mc_eid','_openstat','yclid','zanpid','dclid',
  'ref','referrer','source','medium','campaign',
]);

function cleanUrl(rawUrl) {
  if (!rawUrl) return '';
  let url;
  try { url = new URL(rawUrl); } catch { return rawUrl; }
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  // Remove trailing ? if no params remain
  return url.toString().replace(/\?$/, '');
}

// ─── HTML escaping ────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Minimal Markdown → HTML (used for PDF and standalone HTML output) ───────

function mdToHTML(md) {
  // 1. Pull out fenced code blocks before any other processing
  const blocks = [];
  md = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = blocks.length;
    blocks.push(`<pre><code class="lang-${esc(lang)}">${esc(code.trimEnd())}</code></pre>`);
    return `\x00BLK${idx}\x00`;
  });

  // 2. Inline code
  md = md.replace(/`([^`\n]+)`/g, (_, c) => `<code>${esc(c)}</code>`);

  // 3. Headings (must come before bold/italic)
  md = md.replace(/^(#{1,6})\s+(.+)$/gm, (_, h, t) => `<h${h.length}>${t}</h${h.length}>`);

  // 4. Bold + italic combos (order matters)
  md = md.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  md = md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  md = md.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  md = md.replace(/~~(.+?)~~/g, '<del>$1</del>');
  md = md.replace(/\+\+(.+?)\+\+/g, '<u>$1</u>');
  md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 5. Horizontal rule
  md = md.replace(/^---$/gm, '<hr>');

  // 6. Blockquotes — group consecutive "> " lines into one <blockquote>
  md = md.replace(/((?:^> .+$\n?)+)/gm, match => {
    const inner = match.trim().split('\n')
      .map(l => l.replace(/^> /, '').trim())
      .join('<br>');
    return `<blockquote>${inner}</blockquote>\n`;
  });

  // 6.5. Markdown tables  (| col | col | with separator row)
  md = md.replace(/((?:^\|.+\|[ \t]*$\n?)+)/gm, match => {
    const lines    = match.trim().split('\n');
    const dataRows = lines.filter(l => !/^\|[\s\-:|]+\|/.test(l));
    if (dataRows.length < 1) return match;
    const [hdr, ...body] = dataRows;
    const ths = hdr.split('|').slice(1, -1).map(c => `<th>${c.trim()}</th>`).join('');
    const trs = body.map(row => {
      const tds = row.split('|').slice(1, -1).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  });

  // 7. Task lists (must come before regular lists)
  md = md.replace(/((?:^- \[[ x]\] .+$\n?)+)/gm, match => {
    const items = match.trim().split('\n').map(l => {
      const done = /^- \[x\] /i.test(l);
      const text = l.replace(/^- \[[ x]\] /i, '');
      const box  = done
        ? '<span class="task-done">☑</span>'
        : '<span class="task-open">☐</span>';
      return `<li class="${done ? 'task-done' : 'task-open'}">${box} ${text}</li>`;
    }).join('');
    return `<ul class="task-list">${items}</ul>`;
  });

  // 7b. Regular lists — group consecutive list lines (supports nested indentation)
  md = md.replace(/((?:^[ \t]*(?:\*|-|\d+\.) .+$\n?)+)/gm, match => {
    const lines = match.trimEnd().split('\n');
    // Stack: [{depth, ol, html}] — depth=-1 is root sentinel
    const stack = [{ depth: -1, ol: false, html: '' }];
    const top = () => stack[stack.length - 1];
    for (const line of lines) {
      const indent = (line.match(/^([ \t]*)/) || ['', ''])[1].length;
      const olM  = line.match(/^[ \t]*(\d+)\. (.*)/);
      const ulM  = line.match(/^[ \t]*[\*\-] (.*)/);
      if (!olM && !ulM) continue;
      const isOl  = !!olM;
      const text  = olM ? olM[2] : ulM[1];
      const depth = Math.floor(indent / 2); // 2-space or 4-space indent
      // Pop deeper levels
      while (stack.length > 1 && top().depth >= depth) {
        const closed = stack.pop();
        top().html += `<${closed.ol ? 'ol' : 'ul'}>${closed.html}</${closed.ol ? 'ol' : 'ul'}>`;
      }
      // Push new level if needed
      if (top().depth < depth) {
        stack.push({ depth, ol: isOl, html: '' });
      }
      top().html += `<li>${text}</li>`;
    }
    // Collapse remaining stack
    while (stack.length > 1) {
      const closed = stack.pop();
      top().html += `<${closed.ol ? 'ol' : 'ul'}>${closed.html}</${closed.ol ? 'ol' : 'ul'}>`;
    }
    const root = top();
    // Determine root tag from first real line
    const firstOl = /^[ \t]*\d+\./.test(lines[0]);
    return `<${firstOl ? 'ol' : 'ul'}>${root.html}</${firstOl ? 'ol' : 'ul'}>`;
  });

  // 8. Paragraphs — split on blank lines, wrap plain text chunks
  md = md.split(/\n{2,}/).map(chunk => {
    chunk = chunk.trim();
    if (!chunk) return '';
    if (/^</.test(chunk) || chunk.includes('\x00BLK')) return chunk;
    return `<p>${chunk.replace(/\n/g, '<br>')}</p>`;
  }).filter(Boolean).join('\n');

  // 9. Restore code blocks
  md = md.replace(/\x00BLK(\d+)\x00/g, (_, i) => blocks[+i]);

  return md;
}

// ─── PDF body builder ─────────────────────────────────────────────────────────

function buildPrintBodyHTML(messages, title, site) {
  const date = new Date().toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const parts = [
    `<header class="doc-header">
  <h1>${esc(title)}</h1>
  <p class="meta">Exported from <strong>${esc(site)}</strong> · ${esc(date)}</p>
</header>`,
  ];

  for (const { role, content } of messages) {
    const roleClass = (role.toLowerCase() === 'you') ? 'user' : 'assistant';
    parts.push(
      `<article class="message ${roleClass}">
  <div class="role-label">${esc(role)}</div>
  <div class="content">${mdToHTML(content)}</div>
</article>`
    );
  }

  parts.push(
    `<footer class="inkpour-footer"><a href="https://github.com/tronicum/inkpour">Exported with Inkpour</a></footer>`
  );

  return parts.join('\n');
}

// ─── Standalone HTML builder ──────────────────────────────────────────────────

/**
 * Wraps a full message list in a self-contained HTML file.
 * @param {Array<{role:string,content:string}>} messages
 * @param {string} title
 * @param {string} site
 * @returns {string} complete HTML document
 */
function buildStandaloneHTML(messages, title, site) {
  const bodyContent = buildPrintBodyHTML(messages, title, site);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 15px; line-height: 1.7; color: #1a1a1a; background: #f9f9f9; padding: 2rem 1rem; }
    #page { max-width: 800px; margin: 0 auto; background: #fff; padding: 3rem; border-radius: 8px; box-shadow: 0 2px 20px rgba(0,0,0,0.08); }
    .doc-header { margin-bottom: 2.5rem; padding-bottom: 1.25rem; border-bottom: 2px solid #e5e7eb; }
    .doc-header h1 { font-size: 1.75rem; font-weight: 700; color: #111; margin-bottom: 0.4rem; }
    .meta { font-size: 0.85rem; color: #6b7280; font-style: italic; }
    .message { margin-bottom: 1.5rem; padding: 1.1rem 1.25rem; border-radius: 8px; border-left: 3px solid transparent; }
    .message.user { background: #f0f4ff; border-left-color: #5b5bd6; }
    .message.assistant { background: #f0fdf4; border-left-color: #16a34a; }
    .role-label { font-family: system-ui, sans-serif; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.6rem; }
    .message.user .role-label { color: #5b5bd6; }
    .message.assistant .role-label { color: #16a34a; }
    .content h1,.content h2,.content h3,.content h4,.content h5,.content h6 { font-family: system-ui, sans-serif; margin: 1rem 0 0.4rem; line-height: 1.3; }
    .content h1{font-size:1.4rem}.content h2{font-size:1.2rem}.content h3{font-size:1.05rem}
    .content p { margin: 0.6rem 0; }
    .content p:first-child { margin-top: 0; }
    .content p:last-child  { margin-bottom: 0; }
    .content ul,.content ol { padding-left: 1.5rem; margin: 0.5rem 0; }
    .content li { margin: 0.25rem 0; }
    .content strong { font-weight: 700; }
    .content em { font-style: italic; }
    .content del { text-decoration: line-through; color: #9ca3af; }
    .content code { font-family: 'SF Mono','Fira Code',Consolas,monospace; font-size: 0.85em; background: rgba(0,0,0,0.07); padding: 0.15em 0.35em; border-radius: 4px; }
    .content pre { background: #1e1e2e; color: #cdd6f4; padding: 1rem 1.2rem; border-radius: 6px; overflow-x: auto; margin: 0.75rem 0; font-size: 0.82rem; line-height: 1.55; }
    .content pre code { background: transparent; padding: 0; }
    .content blockquote { border-left: 3px solid #d1d5db; margin: 0.6rem 0; padding: 0.3rem 0.9rem; color: #6b7280; font-style: italic; }
    .content hr { border: none; border-top: 1px solid #e5e7eb; margin: 1rem 0; }
    .content .task-list { list-style: none; padding-left: 0.25rem; }
    .content .task-list li { display: flex; align-items: baseline; gap: 0.4rem; margin: 0.2rem 0; }
    .content .task-done { color: #16a34a; font-size: 1.1em; }
    .content .task-open { color: #9ca3af; font-size: 1.1em; }
    .content li.task-done > :not(span) { color: #9ca3af; text-decoration: line-through; }
    .content a { color: #5b5bd6; text-decoration: underline; text-underline-offset: 2px; }
    .content a:hover { color: #4338ca; }
    .content details { border-left: 3px solid #e5e7eb; padding-left: 0.75rem; margin: 0.5rem 0; }
    .content summary { cursor: pointer; color: #6b7280; font-style: italic; user-select: none; margin-bottom: 0.3rem; }
    .inkpour-footer { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; text-align: center; font-size: 0.78rem; color: #9ca3af; font-family: system-ui, sans-serif; }
    .inkpour-footer a { color: inherit; text-decoration: none; }
    .inkpour-footer a:hover { text-decoration: underline; }
    @media (prefers-color-scheme: dark) {
      body { color: #e4e4e7; background: #09090b; }
      #page { background: #18181b; box-shadow: 0 2px 20px rgba(0,0,0,0.4); }
      .doc-header { border-bottom-color: #3f3f46; }
      .doc-header h1 { color: #fafafa; }
      .meta { color: #a1a1aa; }
      .message.user { background: #1e1e3a; }
      .message.assistant { background: #14291f; }
      .content code { background: rgba(255,255,255,0.1); }
      .content blockquote { border-left-color: #52525b; color: #a1a1aa; }
      .content hr { border-top-color: #3f3f46; }
      .content a { color: #818cf8; }
      .content a:hover { color: #a5b4fc; }
      .content details { border-left-color: #3f3f46; }
      .content summary { color: #71717a; }
      .inkpour-footer { border-top-color: #3f3f46; color: #52525b; }
    }
  </style>
</head>
<body>
  <div id="page">
${bodyContent}
  </div>
</body>
</html>`;
}

// ─── Markdown builder ─────────────────────────────────────────────────────────

/**
 * @param {Array<{role:string,content:string}>} messages
 * @param {string} title
 * @param {string} site
 * @param {{ yamlFrontMatter?:boolean, generateTOC?:boolean, obsidianTags?:boolean }} opts
 * @param {string} sourceUrl
 * @returns {string}
 */
function buildMarkdown(messages, title, site, opts = {}, sourceUrl = '') {
  const date    = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const isoDate = new Date().toISOString();
  let md = '';

  const wordCount = messages
    .map(m => m.content.trim().split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => a + b, 0);
  const readingMin = Math.max(1, Math.round(wordCount / 200));

  if (opts.yamlFrontMatter) {
    const safeTitle = title.replace(/"/g, '\\"');
    const urlLine   = sourceUrl ? `\nsource_url: "${cleanUrl(sourceUrl)}"` : '';
    // Base tags: always present when obsidianTags is on.
    // opts.gistExtraTags: comma-separated custom tags added on Gist exports (always
    // forces [ai-chat, platform] in addition to any user-defined extras).
    const baseTags = opts.obsidianTags ? ['ai-chat', site] : [];
    const extra    = (opts.gistExtraTags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    const allTags  = [...new Set([...baseTags, ...extra])];
    const tagsLine = allTags.length ? `\ntags: [${allTags.join(', ')}]` : '';
    // `type: ai-chat` is the conventional Obsidian Dataview key for grouping
    // notes by kind (e.g. `FROM "" WHERE type = "ai-chat"`) — always included
    // alongside YAML front matter since it's cheap, harmless for non-Obsidian
    // users, and there's no other field playing that role today.
    md += `---\ntitle: "${safeTitle}"\ntype: ai-chat\nplatform: ${site}\nmessages: ${messages.length}\nwords: ${wordCount}\nreading_time_min: ${readingMin}\ndate: ${isoDate}${urlLine}${tagsLine}\nexporter: inkpour\n---\n\n`;
  }

  md += `# ${title}\n\n`;
  const srcNote = sourceUrl ? ` · [source](${cleanUrl(sourceUrl)})` : '';
  md += `> Exported from **${site}** on ${date} · ${messages.length} messages · ~${wordCount.toLocaleString()} words · ~${readingMin} min read${srcNote}\n\n---\n\n`;

  if (opts.generateTOC && messages.length > 4) {
    const counters = {};
    md += `## Contents\n\n`;
    for (const { role } of messages) {
      counters[role] = (counters[role] || 0) + 1;
      const n      = counters[role];
      const anchor = `${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${n}`;
      md += `- [${role} (${n})](#${anchor})\n`;
    }
    md += '\n---\n\n';
  }

  const counters = {};
  for (const { role, content } of messages) {
    counters[role] = (counters[role] || 0) + 1;
    const heading = opts.generateTOC
      ? `## ${role} (${counters[role]})`
      : `## ${role}`;
    md += `${heading}\n\n${content.trim()}\n\n---\n\n`;
  }

  // Attribution footer — subtle, links back to the tool
  md += `*Exported with [Inkpour](https://github.com/tronicum/inkpour)*\n`;
  return md;
}

// ─── Notion export: markdown → blocks ────────────────────────────────────────
// Converts Inkpour's OWN buildMarkdown() output into Notion block objects for
// `PATCH /v1/blocks/{block_id}/children` (used by popup.js's Notion upload
// button). Verified live against Notion's docs 2026-07: the endpoint takes
// `{ children: [...] }`, max 100 block objects per request (batchNotionBlocks
// below splits longer documents), headers `Authorization: Bearer <token>` +
// `Notion-Version: 2026-03-11`.
//
// This is intentionally NOT a general CommonMark parser — buildMarkdown()'s
// output vocabulary is fully controlled by this extension (see htmlToMarkdown
// in src/content.js and convertList()), so the converter only needs to
// understand: ATX headings (#..######, clamped to heading_1/2/3 — Notion's
// v1 append endpoint only needs 1/2/3 per the Batch 5 scope), fenced code
// blocks (```lang), blockquotes (consecutive "> " lines), flat (non-nested)
// "* " / "N. " list items, and "---" horizontal rules (mapped to Notion's
// divider block, including the closing delimiter of Inkpour's own optional
// YAML front matter, which is preserved as a single `yaml` code block rather
// than exploded line by line). Nested lists and tables are explicitly out of
// scope for v1 (see planning/TODOs.md Batch 5) — nested list indentation is
// currently flattened (treated as a top-level item), and inline formatting
// (**bold**, *italic*, links, etc.) is preserved as literal text rather than
// converted to Notion rich-text annotations; both are known v1 limitations.

const NOTION_RICH_TEXT_MAX = 2000; // Notion's per-text-object content length limit

function _notionTextRuns(content) {
  const text = content == null ? '' : String(content);
  if (!text) return [{ type: 'text', text: { content: '' } }];
  const runs = [];
  for (let i = 0; i < text.length; i += NOTION_RICH_TEXT_MAX) {
    runs.push({ type: 'text', text: { content: text.slice(i, i + NOTION_RICH_TEXT_MAX) } });
  }
  return runs;
}

// Common fenced-code-block language aliases (as emitted by content.js's
// `language-xxx` class detection, see the 'pre' case in convertNode) mapped
// to Notion's `code.language` enum (developers.notion.com/reference/block).
// Unrecognized/empty languages fall back to "plain text" (a valid enum value,
// confirmed against the live docs — note the literal space).
const NOTION_LANGUAGE_MAP = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', javascript: 'javascript',
  ts: 'typescript', tsx: 'typescript', typescript: 'typescript',
  py: 'python', python: 'python',
  rb: 'ruby', ruby: 'ruby',
  rs: 'rust', rust: 'rust',
  kt: 'kotlin', kotlin: 'kotlin',
  sh: 'shell', shell: 'shell', bash: 'bash', zsh: 'shell',
  cs: 'c#', csharp: 'c#', 'c#': 'c#',
  cpp: 'c++', 'c++': 'c++',
  objc: 'objective-c', 'objective-c': 'objective-c',
  yml: 'yaml', yaml: 'yaml',
  md: 'markdown', markdown: 'markdown',
  json: 'json', sql: 'sql', html: 'html', css: 'css', go: 'go', java: 'java',
  php: 'php', swift: 'swift', dockerfile: 'docker', docker: 'docker',
  graphql: 'graphql', c: 'c',
  plaintext: 'plain text', text: 'plain text', txt: 'plain text', '': 'plain text',
};

function _notionCodeLanguage(lang) {
  const key = String(lang || '').trim().toLowerCase();
  return NOTION_LANGUAGE_MAP[key] || 'plain text';
}

/**
 * @param {string} markdown - output of buildMarkdown() (or any Inkpour-generated markdown)
 * @returns {Array<object>} flat array of Notion block objects (unbatched)
 */
function markdownToNotionBlocks(markdown) {
  const blocks = [];
  if (!markdown) return blocks;

  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  let i = 0;

  // Optional YAML front matter (only meaningful at the very start of the
  // document) — kept verbatim as a single code block rather than exploded
  // line by line; it's Inkpour's own metadata header, not conversational
  // content.
  if (lines[0] === '---') {
    const closeIdx = lines.indexOf('---', 1);
    if (closeIdx !== -1) {
      const yamlLines = lines.slice(1, closeIdx);
      blocks.push({ type: 'code', code: { caption: [], rich_text: _notionTextRuns(yamlLines.join('\n')), language: 'yaml' } });
      i = closeIdx + 1;
    }
  }

  let paragraphBuf = [];
  const flushParagraph = () => {
    if (!paragraphBuf.length) return;
    const text = paragraphBuf.join('\n').trim();
    paragraphBuf = [];
    if (text) blocks.push({ type: 'paragraph', paragraph: { rich_text: _notionTextRuns(text) } });
  };

  const HEADING_RE = /^(#{1,6})\s+(.*)$/;
  const QUOTE_RE    = /^>\s?(.*)$/;
  const UL_RE       = /^[*-]\s+(.*)$/;
  const OL_RE       = /^\d+\.\s+(.*)$/;
  const FENCE_RE    = /^```\s*([\w+#.-]*)\s*$/;
  const HR_RE       = /^-{3,}$/;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block — consume through the matching closing fence
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      flushParagraph();
      const lang = fenceMatch[1];
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip the closing ``` (or run off the end if unterminated)
      blocks.push({ type: 'code', code: { caption: [], rich_text: _notionTextRuns(codeLines.join('\n')), language: _notionCodeLanguage(lang) } });
      continue;
    }

    // Blank line — paragraph separator
    if (line.trim() === '') {
      flushParagraph();
      i++;
      continue;
    }

    // Horizontal rule (buildMarkdown's message/section separator)
    if (HR_RE.test(line.trim())) {
      flushParagraph();
      blocks.push({ type: 'divider', divider: {} });
      i++;
      continue;
    }

    // ATX heading — Notion's v1 append scope only needs heading_1/2/3, so
    // h4-h6 (rare in practice; htmlToMarkdown does emit them for source h4-h6
    // tags) are clamped down to heading_3 rather than dropped.
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      flushParagraph();
      const level = Math.min(headingMatch[1].length, 3);
      const type  = `heading_${level}`;
      blocks.push({ type, [type]: { rich_text: _notionTextRuns(headingMatch[2].trim()) } });
      i++;
      continue;
    }

    // Blockquote — consume consecutive "> " lines as a single quote block
    if (QUOTE_RE.test(line)) {
      flushParagraph();
      const quoteLines = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoteLines.push(lines[i].match(QUOTE_RE)[1]);
        i++;
      }
      blocks.push({ type: 'quote', quote: { rich_text: _notionTextRuns(quoteLines.join('\n').trim()) } });
      continue;
    }

    // Flat unordered list item (buildMarkdown/convertList always emits "* ")
    const ulMatch = line.match(UL_RE);
    if (ulMatch) {
      flushParagraph();
      blocks.push({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: _notionTextRuns(ulMatch[1].trim()) } });
      i++;
      continue;
    }

    // Flat ordered list item ("1. ", "2. ", ...)
    const olMatch = line.match(OL_RE);
    if (olMatch) {
      flushParagraph();
      blocks.push({ type: 'numbered_list_item', numbered_list_item: { rich_text: _notionTextRuns(olMatch[1].trim()) } });
      i++;
      continue;
    }

    // Plain text line — accumulate into the current paragraph
    paragraphBuf.push(line);
    i++;
  }
  flushParagraph();

  return blocks;
}

/**
 * Splits a flat array of Notion block objects into sequential batches of at
 * most `size` (Notion's append-children endpoint rejects `children` arrays
 * longer than 100 in a single request).
 * @param {Array<object>} blocks
 * @param {number} size
 * @returns {Array<Array<object>>}
 */
function batchNotionBlocks(blocks, size = 100) {
  const batches = [];
  for (let i = 0; i < blocks.length; i += size) {
    batches.push(blocks.slice(i, i + size));
  }
  return batches;
}

// ─── Filename builder ─────────────────────────────────────────────────────────

/**
 * Tokens: {platform} {title} {date} {time} {url} {words} {msgcount}
 * {url}      → page hostname
 * {words}    → approximate word count (0 if not provided)
 * {msgcount} → number of messages (0 if not provided)
 */
function buildFilename(template, platform, titleSlug, sourceUrl = '', wordCount = 0, msgCount = 0) {
  const now  = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toISOString().slice(11, 16).replace(':', '-'); // HH-MM
  let hostname = '';
  try { hostname = sourceUrl ? new URL(sourceUrl).hostname : ''; } catch { /* ignore */ }
  return (template || '{platform}-{title}')
    .replace(/\{platform\}/g,  platform || 'chat')
    .replace(/\{title\}/g,     titleSlug || 'export')
    .replace(/\{date\}/g,      date)
    .replace(/\{time\}/g,      time)
    .replace(/\{url\}/g,       hostname || platform || 'chat')
    .replace(/\{words\}/g,     String(wordCount  || 0))
    .replace(/\{msgcount\}/g,  String(msgCount   || 0))
    // Collapse anything that isn't a Unicode letter/number/underscore/hyphen
    // into a single dash. Uses \p{L}/\p{N} (Unicode property escapes, not
    // a-z/0-9) specifically so titles in any of the 26 locales this
    // extension ships keep their own letters — an ASCII-only class here
    // would strip every accented character (ä, é, ñ, ç, …) and non-Latin
    // script down to bare dashes, which is exactly what happened before:
    // a German title with umlauts came out of the real (non-fuzzer) import
    // with those letters silently replaced.
    .replace(/[^\p{L}\p{N}_\-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'inkpour-export';
}

// ─── JSON builder ─────────────────────────────────────────────────────────────

function buildJSON(messages, title, site, platform) {
  return JSON.stringify({
    exporter:   'inkpour',
    version:    1,
    title,
    platform,
    site,
    exportedAt: new Date().toISOString(),
    messages:   messages.map(({ role, content }) => ({ role, content })),
  }, null, 2);
}

// ─── Base64 helper (chunked to avoid spread stack limit) ─────────────────────

/**
 * Convert a Uint8Array to base64 without hitting the JS spread argument limit.
 * Chunks of 8190 bytes (= 3 × 2730) keep base64 boundaries clean — no padding
 * in the middle of the result string.
 */
function uint8ToBase64(bytes) {
  let result = '';
  const CHUNK = 8190;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    result += btoa(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
  }
  return result;
}

// ─── ZIP builder (pure JS, PKZIP STORED / method 0) ──────────────────────────

const _CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function _crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (const b of bytes) c = _CRC32_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function _dosDateTime() {
  const n = new Date();
  return {
    dosDate: ((n.getFullYear() - 1980) << 9) | ((n.getMonth() + 1) << 5) | n.getDate(),
    dosTime: (n.getHours() << 11) | (n.getMinutes() << 5) | Math.floor(n.getSeconds() / 2),
  };
}

/**
 * Build a PKZIP-compatible archive (method 0 = STORED, no compression).
 * @param {Array<{name:string, content:string}>} files
 * @returns {Uint8Array}
 */
function buildZip(files) {
  const enc = new TextEncoder();
  const { dosDate, dosTime } = _dosDateTime();
  const w16 = (v, o, b) => new DataView(b).setUint16(o, v, true);
  const w32 = (v, o, b) => new DataView(b).setUint32(o, v, true);

  const entries = files.map(f => {
    const name = enc.encode(f.name);
    const data = enc.encode(f.content);
    return { name, data, crc: _crc32(data) };
  });

  const parts = [], offsets = [];
  let pos = 0;

  // Local headers + file data
  for (const e of entries) {
    offsets.push(pos);
    const lhBuf = new ArrayBuffer(30 + e.name.length);
    const lh    = new Uint8Array(lhBuf);
    w32(0x04034b50, 0, lhBuf); w16(20, 4, lhBuf); w16(0, 6, lhBuf);
    w16(0, 8, lhBuf); w16(dosTime, 10, lhBuf); w16(dosDate, 12, lhBuf);
    w32(e.crc, 14, lhBuf); w32(e.data.length, 18, lhBuf); w32(e.data.length, 22, lhBuf);
    w16(e.name.length, 26, lhBuf); w16(0, 28, lhBuf);
    lh.set(e.name, 30);
    parts.push(lh, e.data);
    pos += lh.length + e.data.length;
  }

  const cdStart = pos;

  // Central directory
  for (let i = 0; i < entries.length; i++) {
    const e     = entries[i];
    const cdBuf = new ArrayBuffer(46 + e.name.length);
    const cd    = new Uint8Array(cdBuf);
    w32(0x02014b50, 0, cdBuf); w16(20, 4, cdBuf); w16(20, 6, cdBuf);
    w16(0, 8, cdBuf); w16(0, 10, cdBuf); w16(dosTime, 12, cdBuf); w16(dosDate, 14, cdBuf);
    w32(e.crc, 16, cdBuf); w32(e.data.length, 20, cdBuf); w32(e.data.length, 24, cdBuf);
    w16(e.name.length, 28, cdBuf); w16(0, 30, cdBuf); w16(0, 32, cdBuf);
    w16(0, 34, cdBuf); w16(0, 36, cdBuf); w32(0, 38, cdBuf);
    w32(offsets[i], 42, cdBuf);
    cd.set(e.name, 46);
    parts.push(cd);
    pos += cd.length;
  }

  const cdSize = pos - cdStart;

  // End of central directory record
  const eocdBuf = new ArrayBuffer(22);
  w32(0x06054b50, 0, eocdBuf); w16(0, 4, eocdBuf); w16(0, 6, eocdBuf);
  w16(entries.length, 8, eocdBuf); w16(entries.length, 10, eocdBuf);
  w32(cdSize, 12, eocdBuf); w32(cdStart, 16, eocdBuf); w16(0, 20, eocdBuf);
  parts.push(new Uint8Array(eocdBuf));

  const total = parts.reduce((s, p) => s + p.length, 0);
  const zip   = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { zip.set(p, off); off += p.length; }
  return zip;
}

// ─── Code-block extension map ─────────────────────────────────────────────────

const _CODE_EXT = {
  python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
  jsx: 'jsx', tsx: 'tsx', bash: 'sh', shell: 'sh', sh: 'sh', zsh: 'sh',
  rust: 'rs', rs: 'rs', go: 'go', java: 'java', kotlin: 'kt', swift: 'swift',
  cpp: 'cpp', 'c++': 'cpp', c: 'c', css: 'css', scss: 'scss', sass: 'sass',
  html: 'html', xml: 'xml', svg: 'svg', sql: 'sql', json: 'json',
  yaml: 'yml', yml: 'yml', toml: 'toml', markdown: 'md', md: 'md',
  r: 'r', ruby: 'rb', rb: 'rb', php: 'php', cs: 'cs', csharp: 'cs',
};

/**
 * Build the file list for ZIP export: chat.md + one file per code block.
 * @returns {{ files: Array<{name:string,content:string}>, codeCount: number }}
 */
function buildZipExport(messages, title, site, opts, sourceUrl) {
  const md    = buildMarkdown(messages, title, site, opts, sourceUrl);
  const files = [{ name: 'chat.md', content: md }];

  const counters      = {};
  const codeBlockRe   = /```(\w*)\n([\s\S]*?)```/g;

  for (const { content } of messages) {
    codeBlockRe.lastIndex = 0;
    let m;
    while ((m = codeBlockRe.exec(content)) !== null) {
      const lang = (m[1] || '').toLowerCase();
      const code = m[2].trimEnd();
      if (!code) continue;
      const ext = _CODE_EXT[lang] || 'txt';
      counters[ext] = (counters[ext] || 0) + 1;
      files.push({ name: `snippet-${counters[ext]}.${ext}`, content: code + '\n' });
    }
  }

  return { files, codeCount: files.length - 1 };
}

// ─── DOCX builder (pure JS, reuses buildZip) ─────────────────────────────────
//
// Generates a valid .docx (OOXML) from messages + title.
// No external dependencies — all XML is built as template strings.
// Returns a Uint8Array (the ZIP bytes), same as buildZip.

/**
 * Escape special characters for XML text content.
 */
function _xmlEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Strip HTML tags and unescape HTML entities — used when converting HTML text
 * nodes into plain strings for OOXML runs.
 */
function _htmlDecodeText(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'");
}

/**
 * Parse HTML inline markup (output of mdToHTML) into OOXML <w:r> elements.
 * Handles: <strong>, <em>, <code>, <del>, <strong><em>, <a href>, plain text.
 * Hyperlinks are registered in _docxLinkMap so buildDocx can emit relationship entries.
 */
function _htmlInlineToRuns(html) {
  const TOKEN = /<strong><em>([\s\S]*?)<\/em><\/strong>|<strong>([\s\S]*?)<\/strong>|<em>([\s\S]*?)<\/em>|<code>([\s\S]*?)<\/code>|<del>([\s\S]*?)<\/del>|<u>([\s\S]*?)<\/u>|<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let result = '';
  let last   = 0;
  let m;
  while ((m = TOKEN.exec(html)) !== null) {
    if (m.index > last) result += _wRun(_htmlDecodeText(html.slice(last, m.index)));
    if      (m[1]) result += _wRun(_htmlDecodeText(m[1]), { bold: true, italic: true });
    else if (m[2]) result += _wRun(_htmlDecodeText(m[2]), { bold: true });
    else if (m[3]) result += _wRun(_htmlDecodeText(m[3]), { italic: true });
    else if (m[4]) result += _wRun(_htmlDecodeText(m[4]), { code: true });
    else if (m[5]) result += _wRun(_htmlDecodeText(m[5]), { strike: true });
    else if (m[6]) result += _wRun(_htmlDecodeText(m[6]), { underline: true });
    else if (m[7] !== undefined) {
      // Hyperlink — register URL, emit <w:hyperlink>
      const href = m[7];
      const text = _htmlDecodeText(m[8] || href);
      const rId  = _docxLinkRId(href);
      const rPr  = `<w:rPr><w:color w:val="5B5BD6"/><w:u w:val="single"/></w:rPr>`;
      result += `<w:hyperlink r:id="${rId}"><w:r>${rPr}<w:t xml:space="preserve">${_xmlEsc(text)}</w:t></w:r></w:hyperlink>`;
    }
    last = m.index + m[0].length;
  }
  if (last < html.length) result += _wRun(_htmlDecodeText(html.slice(last)));
  return result || _wRun('');
}

// Per-export link registry — populated during _htmlInlineToRuns, consumed by buildDocx.
let _docxLinks = [];   // [{url, rId}]
function _docxLinkRId(url) {
  const existing = _docxLinks.find(l => l.url === url);
  if (existing) return existing.rId;
  const rId = `rId${3 + _docxLinks.length}`; // rId1=styles, rId2=footer link, rId3+ = content links
  _docxLinks.push({ url, rId });
  return rId;
}

/**
 * Parse a line of markdown inline syntax into OOXML <w:r> elements.
 * Handles: ***bold+italic***, **bold**, *italic*, `code`, ~~strike~~, [text](url)
 */
function _mdInlineToRuns(text) {
  // Token regex — order matters (longer markers first)
  const TOKEN = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*([^*\n]+?)\*|`([^`\n]+?)`|~~(.+?)~~|\[([^\]]+)\]\(([^)]+)\))/g;
  let result = '';
  let last = 0;
  let m;
  while ((m = TOKEN.exec(text)) !== null) {
    if (m.index > last) result += _wRun(text.slice(last, m.index));
    if      (m[2]) result += _wRun(m[2], { bold: true, italic: true });
    else if (m[3]) result += _wRun(m[3], { bold: true });
    else if (m[4]) result += _wRun(m[4], { italic: true });
    else if (m[5]) result += _wRun(m[5], { code: true });
    else if (m[6]) result += _wRun(m[6], { strike: true });
    else if (m[7]) result += _wRun(m[7]) + _wRun(` (${m[8]})`, { italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) result += _wRun(text.slice(last));
  return result || _wRun('');
}

/**
 * Build a single <w:r> run with optional character properties.
 */
function _wRun(text, props = {}) {
  const rpr = [];
  if (props.bold)      rpr.push('<w:b/>');
  if (props.italic)    rpr.push('<w:i/>');
  if (props.strike)    rpr.push('<w:strike/>');
  if (props.underline) rpr.push('<w:u w:val="single"/>');
  if (props.color)     rpr.push(`<w:color w:val="${props.color}"/>`);
  if (props.font) {
    const f = props.font;
    rpr.push(`<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"/>`);
  }
  if (props.size) {
    const s = props.size * 2; // half-points
    rpr.push(`<w:sz w:val="${s}"/><w:szCs w:val="${s}"/>`);
  }
  if (props.code) {
    rpr.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>');
    rpr.push('<w:sz w:val="18"/><w:szCs w:val="18"/>');
    rpr.push('<w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/>');
  }
  const rprXml = rpr.length ? `<w:rPr>${rpr.join('')}</w:rPr>` : '';
  return `<w:r>${rprXml}<w:t xml:space="preserve">${_xmlEsc(text)}</w:t></w:r>`;
}

/**
 * Build a <w:p> paragraph with optional style, extra pPr XML, and background fill.
 */
function _wPara(runs, style = '', extraPPr = '', fill = '') {
  const shdXml = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '';
  const ppr = (style || extraPPr || shdXml)
    ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extraPPr}${shdXml}</w:pPr>`
    : '';
  return `<w:p>${ppr}${runs}</w:p>`;
}

/**
 * Paragraph with a bottom border — used as a section divider.
 */
function _wHRule() {
  return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D4D4D8"/></w:pBdr><w:spacing w:before="80" w:after="80"/></w:pPr></w:p>`;
}

/**
 * Code block: one paragraph per line, monospaced, dark background.
 * Lines are joined with <w:br/> inside a single paragraph for compactness.
 * @param {string} fill  optional parent message background (ignored — code always uses its own bg)
 */
function _wCodeBlock(text, lang = '', _fill = '') {
  const lines  = text.split('\n');
  const font   = '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>';
  const sz     = '<w:sz w:val="18"/><w:szCs w:val="18"/>';
  const rPrXml = `<w:rPr>${font}${sz}</w:rPr>`;

  let runs = '';
  lines.forEach((line, i) => {
    runs += `<w:r>${rPrXml}<w:t xml:space="preserve">${_xmlEsc(line)}</w:t></w:r>`;
    if (i < lines.length - 1) runs += `<w:r><w:br/></w:r>`;
  });

  // PreformattedText is a standard OOXML built-in style — Word, Pages, and
  // LibreOffice all render it as monospace without needing a custom definition.
  const pPr = `<w:pPr><w:pStyle w:val="PreformattedText"/><w:spacing w:before="40" w:after="40"/></w:pPr>`;
  const codePara = `<w:p>${pPr}${runs}</w:p>`;

  if (lang) {
    const labelPPr = `<w:pPr><w:pStyle w:val="PreformattedText"/><w:spacing w:before="80" w:after="0"/></w:pPr>`;
    const labelPara = `<w:p>${labelPPr}${_wRun(lang, { color: '9CA3AF', size: 16, font: 'Courier New' })}</w:p>`;
    return labelPara + codePara;
  }
  return codePara;
}

/**
 * Build a native OOXML table from parsed HTML <table> markup.
 * @param {string} tableHtml  raw <table>...</table> HTML string
 * @param {string} fill       parent message background fill hex (for data cell bg)
 */
function _wTable(tableHtml, fill = '') {
  // Parse all rows (thead + tbody)
  const rows = [];
  const trRe = /<tr>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = trRe.exec(tableHtml)) !== null) {
    const cells = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
    let cm;
    while ((cm = tdRe.exec(m[1])) !== null) cells.push(cm[1]);
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return '';

  const numCols  = Math.max(...rows.map(r => r.length));
  const colWidth = Math.floor(9026 / numCols); // A4 content width in twips

  const borderAttrs = 'w:val="single" w:sz="4" w:space="0" w:color="D4D4D8"';
  const tblPr = `<w:tblPr><w:tblW w:w="9026" w:type="dxa"/><w:tblBorders><w:top ${borderAttrs}/><w:left ${borderAttrs}/><w:bottom ${borderAttrs}/><w:right ${borderAttrs}/><w:insideH ${borderAttrs}/><w:insideV ${borderAttrs}/></w:tblBorders></w:tblPr>`;
  const tblGrid = `<w:tblGrid>${Array(numCols).fill(`<w:gridCol w:w="${colWidth}"/>`).join('')}</w:tblGrid>`;

  const rowsXml = rows.map((cells, ri) => {
    const isHeader = ri === 0;
    const cellFill = isHeader ? 'E4E4E7' : (fill || 'FFFFFF');
    const cellsXml = cells.map(content => {
      const tcPr = `<w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${cellFill}"/><w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>`;
      const runs = isHeader
        ? _wRun(_htmlDecodeText(content), { bold: true })
        : _htmlInlineToRuns(content);
      const para = `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${runs}</w:p>`;
      return `<w:tc>${tcPr}${para}</w:tc>`;
    }).join('');
    return `<w:tr>${cellsXml}</w:tr>`;
  }).join('');

  return `<w:tbl>${tblPr}${tblGrid}${rowsXml}</w:tbl>`;
}

/**
 * Convert HTML (output of mdToHTML) to OOXML paragraph/table elements.
 * Handles: h1-h6, p, ul, ol, pre>code, blockquote, table, hr.
 * @param {string} html   HTML from mdToHTML()
 * @param {string} fill   hex fill for message background shading (no #)
 */
function _htmlToOOXML(html, fill = '') {
  const out = [];

  // Tokenise into block-level chunks
  const BLOCK = /(<details>[\s\S]*?<\/details>|<table[\s\S]*?<\/table>|<pre><code[^>]*>[\s\S]*?<\/code><\/pre>|<ul[^>]*>[\s\S]*?<\/ul>|<ol>[\s\S]*?<\/ol>|<h[1-6]>[\s\S]*?<\/h[1-6]>|<blockquote>[\s\S]*?<\/blockquote>|<hr>|<p>[\s\S]*?<\/p>)/g;
  let last = 0, m;
  const tokens = [];
  while ((m = BLOCK.exec(html)) !== null) {
    const between = html.slice(last, m.index).trim();
    if (between) tokens.push({ raw: between, block: false });
    tokens.push({ raw: m[0], block: true });
    last = BLOCK.lastIndex;
  }
  const tail = html.slice(last).trim();
  if (tail) tokens.push({ raw: tail, block: false });

  for (const { raw } of tokens) {
    // ── Details / summary (collapsible section) ──
    if (/^<details>/.test(raw)) {
      const sumM  = raw.match(/<summary>([\s\S]*?)<\/summary>/);
      const label = sumM ? _htmlDecodeText(sumM[1]) : 'Details';
      // Label as italic bold paragraph with left border
      const bdr   = `<w:pBdr><w:left w:val="single" w:sz="6" w:space="4" w:color="D4D4D8"/></w:pBdr>`;
      out.push(`<w:p><w:pPr>${bdr}<w:spacing w:before="80" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:i/><w:color w:val="71717A"/></w:rPr><w:t>${_xmlEsc(label)}</w:t></w:r></w:p>`);
      // Body (everything after </summary>)
      const bodyHtml = raw.replace(/<details>/, '').replace(/<\/details>$/, '')
                          .replace(/<summary>[\s\S]*?<\/summary>/, '').trim();
      if (bodyHtml) {
        const bodyPPr = `<w:ind w:left="360"/>`;
        const inner   = _htmlToOOXML(bodyHtml, fill);
        // Indent all body paragraphs
        out.push(inner.replace(/<w:pPr>/g, `<w:pPr>${bodyPPr}`)
                      .replace(/<w:p>(?!<w:pPr>)/g, `<w:p><w:pPr>${bodyPPr}</w:pPr>`));
      }
      continue;
    }

    // ── Table ──
    if (/^<table/.test(raw)) {
      out.push(_wTable(raw, fill));
      continue;
    }

    // ── Code block ──
    const pre = raw.match(/^<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>$/);
    if (pre) {
      const langM = pre[1].match(/class="(?:lang(?:uage)?-)([^"\s]+)"/);
      const lang  = langM ? langM[1] : '';
      const code  = _htmlDecodeText(pre[2]);
      out.push(_wCodeBlock(code, lang, fill));
      continue;
    }

    // ── Unordered list (including task lists) ──
    if (/^<ul/.test(raw)) {
      for (const [, cls, c] of raw.matchAll(/<li(?:\s+class="([^"]*)")?>([\s\S]*?)<\/li>/g)) {
        const isTask = cls && cls.includes('task-');
        const isDone = cls && cls.includes('task-done');
        if (isTask) {
          // Strip the <span class="task-...">☑/☐</span> — use text symbol instead
          const text = c.replace(/<span[^>]*>[^<]*<\/span>\s*/g, '');
          const symbol = _wRun(isDone ? '☑ ' : '☐ ', isDone ? { color: '16A34A' } : { color: '9CA3AF' });
          const content = isDone
            ? _wRun(_htmlDecodeText(text), { strike: true, color: '9CA3AF' })
            : _htmlInlineToRuns(text);
          out.push(_wPara(symbol + content, '', '<w:ind w:left="440" w:hanging="280"/>', fill));
        } else {
          out.push(_wPara(_wRun('• ') + _htmlInlineToRuns(c), '', '<w:ind w:left="440" w:hanging="280"/>', fill));
        }
      }
      continue;
    }

    // ── Ordered list ──
    if (/^<ol>/.test(raw)) {
      let idx = 1;
      for (const [, c] of raw.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
        out.push(_wPara(_wRun(`${idx++}. `) + _htmlInlineToRuns(c), '', '<w:ind w:left="440" w:hanging="280"/>', fill));
      }
      continue;
    }

    // ── Headings ──
    const hm = raw.match(/^<h([1-6])>([\s\S]*?)<\/h\1>$/);
    if (hm) {
      const styleMap = ['', 'Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6'];
      out.push(_wPara(_htmlInlineToRuns(hm[2]), styleMap[+hm[1]] || 'Heading3', '', fill));
      continue;
    }

    // ── Blockquote ──
    const bq = raw.match(/^<blockquote>([\s\S]*?)<\/blockquote>$/);
    if (bq) {
      out.push(_wPara(_htmlInlineToRuns(bq[1]), 'IntenseQuote', '', ''));
      continue;
    }

    // ── HR ──
    if (raw === '<hr>') { out.push(_wHRule()); continue; }

    // ── Paragraph ──
    const pm = raw.match(/^<p>([\s\S]*?)<\/p>$/);
    if (pm) {
      const lines = pm[1].split(/<br>/);
      if (lines.length === 1) {
        out.push(_wPara(_htmlInlineToRuns(pm[1]), '', '', fill));
      } else {
        let runs = '';
        lines.forEach((line, i) => {
          runs += _htmlInlineToRuns(line);
          if (i < lines.length - 1) runs += '<w:r><w:br/></w:r>';
        });
        out.push(_wPara(runs, '', '', fill));
      }
      continue;
    }

    // ── Fallback: plain text ──
    const plain = _htmlDecodeText(raw).trim();
    if (plain) out.push(_wPara(_wRun(plain), '', '', fill));
  }

  return out.join('\n');
}

/**
 * Colored role label paragraph — small caps label with left-border accent + fill.
 */
function _wMsgLabel(role, accentColor, fill) {
  const bdr  = `<w:pBdr><w:left w:val="single" w:sz="18" w:space="4" w:color="${accentColor}"/></w:pBdr>`;
  const shd  = `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;
  const spc  = `<w:spacing w:before="160" w:after="0"/>`;
  const pPr  = `<w:pPr>${bdr}${shd}${spc}</w:pPr>`;
  const rPr  = `<w:rPr><w:b/><w:smallCaps/><w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="${accentColor}"/></w:rPr>`;
  return `<w:p>${pPr}<w:r>${rPr}<w:t>${_xmlEsc(role)}</w:t></w:r></w:p>`;
}



/**
 * Build a .docx (OOXML) archive from messages.
 * Returns a Uint8Array (the ZIP bytes).
 *
 * @param {Array<{role:string,content:string}>} messages
 * @param {string} title
 * @param {string} site
 * @param {{ yamlFrontMatter?:boolean }} opts  (opts not used for DOCX — just for API consistency)
 * @param {string} sourceUrl
 * @returns {Uint8Array}
 */
function buildDocx(messages, title, site, opts = {}, sourceUrl = '') {
  _docxLinks = []; // reset per-export link registry
  const date     = new Date().toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const wordCount = messages
    .map(m => m.content.trim().split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => a + b, 0);
  const srcNote  = sourceUrl ? ` · ${cleanUrl(sourceUrl)}` : '';
  const metaText = `Exported from ${site} on ${date} · ${messages.length} messages · ~${wordCount.toLocaleString()} words${srcNote}`;

  // ── Body paragraphs ──────────────────────────────────────────────────────
  let body = '';

  // Document title
  body += _wPara(_wRun(title), 'Heading1');

  // Metadata
  body += _wPara(_wRun(metaText, { italic: true, color: '71717A' }), '', '<w:spacing w:after="240"/>');

  // Messages — colored blocks: user=indigo, AI=green
  for (const { role, content } of messages) {
    const isUser    = role.toLowerCase() === 'you';
    const accent    = isUser ? '5B5BD6' : '16A34A';
    const bgFill    = isUser ? 'EEF2FF' : 'F0FDF4';

    // Colored role label with left-border accent
    body += _wMsgLabel(role, accent, bgFill);

    // Content: MD → HTML → OOXML with background shading
    const html = mdToHTML(content.trim());
    body += _htmlToOOXML(html, bgFill);

    // Trailing spacer (no fill — returns to white)
    body += _wPara('', '', '<w:spacing w:before="0" w:after="200"/>');
  }

  // Attribution footer
  const footerRpr = `<w:rPr><w:i/><w:color w:val="9CA3AF"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>`;
  body += `<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="E5E7EB"/></w:pBdr><w:spacing w:before="160" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r>${footerRpr}<w:t>Exported with </w:t></w:r><w:hyperlink r:id="rId2"><w:r>${footerRpr}<w:rPr><w:i/><w:color w:val="9CA3AF"/><w:sz w:val="16"/><w:szCs w:val="16"/><w:u w:val="single"/></w:rPr><w:t>Inkpour</w:t></w:r></w:hyperlink></w:p>`;

  // Section properties (A4 page)
  body += `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;

  // ── OOXML files ──────────────────────────────────────────────────────────
  const NS_W   = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const NS_R   = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_PKG = 'http://schemas.openxmlformats.org/package/2006';
  const NS_REL = NS_R;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="${NS_PKG}/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"   ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const pkgRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_PKG}/relationships">
  <Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const contentLinkRels = _docxLinks
    .map(({ url, rId }) => `  <Relationship Id="${rId}" Type="${NS_REL}/hyperlink" Target="${url}" TargetMode="External"/>`)
    .join('\n');
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_PKG}/relationships">
  <Relationship Id="rId1" Type="${NS_REL}/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="${NS_REL}/hyperlink" Target="https://github.com/tronicum/inkpour" TargetMode="External"/>
${contentLinkRels}
</Relationships>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${NS_W}" w:docDefaults="">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
      <w:sz w:val="22"/><w:szCs w:val="22"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>

  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/><w:color w:val="18181B"/></w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="3F3F46"/></w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="160" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="52525B"/></w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="120" w:after="40"/></w:pPr>
    <w:rPr><w:b/><w:i/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="71717A"/></w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading5">
    <w:name w:val="heading 5"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="100" w:after="40"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="71717A"/></w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading6">
    <w:name w:val="heading 6"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="80" w:after="40"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="A1A1AA"/></w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="IntenseQuote">
    <w:name w:val="Intense Quote"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:ind w:left="720" w:right="720"/>
      <w:spacing w:before="80" w:after="80"/>
      <w:pBdr>
        <w:left w:val="single" w:sz="6" w:space="4" w:color="D4D4D8"/>
      </w:pBdr>
    </w:pPr>
    <w:rPr><w:i/><w:color w:val="6B7280"/></w:rPr>
  </w:style>

</w:styles>`;

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}">
  <w:body>
${body}
  </w:body>
</w:document>`;

  return buildZip([
    { name: '[Content_Types].xml',          content: contentTypes },
    { name: '_rels/.rels',                   content: pkgRels      },
    { name: 'word/_rels/document.xml.rels', content: docRels      },
    { name: 'word/styles.xml',              content: styles       },
    { name: 'word/document.xml',            content: document     },
  ]);
}

// ─── Import parsing ───────────────────────────────────────────────────────────
// Turns raw pasted text (e.g. copied out of Apple Notes from a mobile chat
// app) into the same {role, content} message shape every live extractor in
// src/content.js produces, so imported conversations flow through the exact
// same export/history pipeline as a captured page. This is a first-pass
// heuristic — expected to be tweaked against real-world paste samples.

// ─── Rich-text (HTML) clipboard → Markdown ───────────────────────────────────
// When the paste event carries a "text/html" payload (copying directly out of
// a browser tab, or out of an app whose share/paste channel preserves rich
// text — Notes' behavior here varies by version/source), tables and bold/
// italic formatting survive, where a plain-text paste would flatten a table
// into an unreadable run of cell text. Regex-based on purpose (no DOMParser),
// since this file is shared with background.js's service-worker context,
// which has no DOM — same constraint mdToHTML() above already works under.

function _htmlEntitiesDecode(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'");
}

/** Inline HTML (bold/italic/code/links/br) → Markdown, for use inside a block. */
function _htmlInlineToMarkdown(html) {
  let s = String(html);
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**');
  s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*');
  s = s.replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`');
  s = s.replace(/<del>([\s\S]*?)<\/del>/gi, '~~$1~~');
  s = s.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  s = s.replace(/<[^>]+>/g, ''); // drop any remaining span/font/etc. wrappers
  return _htmlEntitiesDecode(s).trim();
}

/** One <table>...</table> → a Markdown pipe table. */
function _htmlTableToMarkdown(tableHtml) {
  const rows = [];
  for (const trM of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...trM[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(m => _htmlInlineToMarkdown(m[1]).replace(/\|/g, '\\|').replace(/\n+/g, ' '));
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return '';

  const numCols = Math.max(...rows.map(r => r.length));
  const pad = r => { while (r.length < numCols) r.push(''); return r; };
  const [header, ...body] = rows.map(pad);
  const line = cells => `| ${cells.join(' | ')} |`;
  const sep  = `| ${Array(numCols).fill('---').join(' | ')} |`;
  return [line(header), sep, ...body.map(line)].join('\n');
}

/**
 * Converts clipboard HTML (from a "paste" event's text/html data) into
 * Markdown text: tables, headings, bold/italic/code/links, lists, and
 * paragraph breaks. Falls back gracefully — unrecognized tags are just
 * stripped, so worst case you get plain text back, same as a normal paste.
 * @param {string} html
 * @returns {string}
 */
function htmlPasteToMarkdown(html) {
  let s = String(html || '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');

  const blocks = [];

  // Tables first (they contain their own <tr>/<td>, must not be touched by
  // the later paragraph/list passes).
  s = s.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, inner) => {
    const md = _htmlTableToMarkdown(inner);
    blocks.push(md);
    return `\x00BLOCK${blocks.length - 1}\x00`;
  });

  // Fenced code blocks.
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, preInner) => {
    const codeM = preInner.match(/<code([^>]*)>([\s\S]*?)<\/code>/i);
    const attrs = codeM ? codeM[1] : '';
    const code  = codeM ? codeM[2] : preInner;
    const langM = attrs.match(/lang(?:uage)?-(\w+)/i);
    blocks.push('```' + (langM ? langM[1] : '') + '\n' + _htmlEntitiesDecode(code.replace(/<[^>]+>/g, '')).trimEnd() + '\n```');
    return `\x00BLOCK${blocks.length - 1}\x00`;
  });

  // Headings.
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, inner) =>
    `\n\n${'#'.repeat(+n)} ${_htmlInlineToMarkdown(inner)}\n\n`);

  // Lists — one line per <li>, "- " for <ul>, "1. " for <ol>.
  s = s.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) =>
    '\n\n' + [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      .map(m => `- ${_htmlInlineToMarkdown(m[1])}`).join('\n') + '\n\n');
  s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let i = 0;
    return '\n\n' + [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      .map(m => `${++i}. ${_htmlInlineToMarkdown(m[1])}`).join('\n') + '\n\n';
  });

  // Blockquotes.
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) =>
    `\n\n> ${_htmlInlineToMarkdown(inner).replace(/\n/g, '\n> ')}\n\n`);

  // Paragraph/div/section boundaries → blank-line-separated blocks.
  s = s.replace(/<\/(p|div|section|li)>/gi, '\n\n');
  s = s.replace(/<(p|div|section)[^>]*>/gi, '');

  // Whatever inline markup remains (bold/italic/code/links/br) outside blocks.
  s = _htmlInlineToMarkdown(s);

  // Restore extracted blocks (tables/code), then collapse excess blank lines.
  s = s.replace(/\x00BLOCK(\d+)\x00/g, (_, i) => `\n\n${blocks[+i]}\n\n`);
  s = s.split(/\n{3,}/).join('\n\n').trim();

  return s;
}

// ─── Gemini / Google AI paste cleanup ─────────────────────────────────────────
// Recognizes the boilerplate chrome that Gemini/Google AI answers leave behind
// when copy-pasted as plain text (e.g. via a phone's share sheet into Apple
// Notes): a disclaimer line after every answer ("AI responses may contain
// mistakes" / German "KI-Antworten können Fehler enthalten..."), a
// "Use code with caution" label after every code snippet, numbered "N
// Websites" source-panel headers, video timestamps, and the U+FFFC object-
// replacement character left behind by stripped images/icons.

// Tail after the disclaimer sentence varies by Google surface: Gemini's own
// app uses "Weitere Informationen"/"For more information", but Google
// Search's "AI Mode" panel uses a plain "Learn more" link instead — found via
// a real AI Mode search-results PDF export (119 pages) that has neither of
// the previously-known tails.
const GEMINI_DISCLAIMER_RE    = /^(ki-antworten können fehler enthalten|ai responses (?:may|can) (?:include|contain) mistakes)\.?\s*(weitere informationen|for more information|learn more)?\.?\s*$/i;
const GEMINI_CODE_CAUTION_RE  = /^(verwende code mit vorsicht|use code with caution)\.?\s*(\[[\d,\s]+\])?\s*$/i;
// "s?" also covers the singular ("1 Website" / "1 Quelle" / "1 Source") —
// previously plural-only, so a count of exactly one source leaked through
// as unrecognized noise instead of being stripped like every other count.
// "sites?" (bare, no "web" prefix) is the AI Mode search panel's own count
// label ("8 sites" / "1 site"), distinct from Gemini's "N Websites" —
// same real 119-page AI Mode export exposed this gap too.
const GEMINI_SOURCES_HEADER_RE = /^\d+\s+(websites?|sites?|quellen?|sources?)\s*$/i;
const GEMINI_TIMESTAMP_RE     = /^\d{1,2}:\d{2}$/;
const CITATION_BRACKET_RE     = /\[\d+(?:,\s*\d+)*\]/;
// AI Mode occasionally tacks a domain-specific caution sentence directly in
// front of the regular disclaimer on the very same line (e.g. answers that
// brush up against medical/legal/financial topics) — seen in the same
// export even for an unrelated printer-driver question, so it's a generic
// classifier-triggered addition rather than something tied to real medical
// content. Matched separately (not folded into GEMINI_DISCLAIMER_RE) since
// it can precede the disclaimer rather than replace it.
const GEMINI_TOPIC_CAUTION_RE = /this is for informational purposes only\.\s*for (medical|legal|financial) advice(?:\s*(?:or|and)\s*diagnosis)?,?\s*consult a professional\.?\s*/i;

// Bare language-name lines Gemini leaves before a code snippet (the fenced
// ```lang wrapper itself doesn't survive plain-text copy, just the label).
const CODE_LANG_NAMES = new Set([
  'python', 'bash', 'shell', 'sh', 'zsh', 'javascript', 'js', 'typescript', 'ts',
  'jsx', 'tsx', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'scss', 'sql', 'java',
  'go', 'rust', 'ruby', 'rb', 'php', 'c', 'cpp', 'kotlin', 'swift', 'csharp', 'cs',
  'markdown', 'md',
]);
const INLINE_CODE_LANG_RE = /^(.*?):(python|bash|shell|sh|zsh|javascript|js|typescript|ts|json|yaml|yml|xml|html|css|sql|java|go|rust|ruby|rb|php)\s{1,4}(.+)$/i;

/** True if the text carries at least one recognizable Gemini/Google AI paste marker. */
function looksLikeGeminiPaste(text) {
  if (GEMINI_DISCLAIMER_RE.test(text.trim())) return true;
  return text.split(/\r?\n/).some(l => {
    const t = l.trim();
    return GEMINI_DISCLAIMER_RE.test(t) || GEMINI_CODE_CAUTION_RE.test(t) || GEMINI_SOURCES_HEADER_RE.test(t);
  });
}

/**
 * Strips Gemini/Google AI boilerplate and reconstructs fenced code blocks
 * from the bare "language name + code lines + caution label" pattern plain-
 * text copy leaves behind. Each removed disclaimer is replaced with a ' '
 * marker so callers can split turns around where an AI answer ended.
 */
function cleanGeminiPaste(raw) {
  const lines = raw.replace(/￼/g, '').split(/\r?\n/);
  const out = [];
  let inCode = false, codeLang = '', codeBuf = [];

  const flushCode = () => {
    if (codeBuf.length) out.push('```' + codeLang, ...codeBuf, '```');
    inCode = false; codeLang = ''; codeBuf = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (inCode) {
      if (GEMINI_CODE_CAUTION_RE.test(trimmed)) { flushCode(); }
      else codeBuf.push(line);
      continue;
    }

    if (CODE_LANG_NAMES.has(trimmed.toLowerCase()) && trimmed.length < 15) {
      inCode = true; codeLang = trimmed.toLowerCase(); codeBuf = [];
      continue;
    }

    const inlineM = line.match(INLINE_CODE_LANG_RE);
    if (inlineM) {
      out.push(inlineM[1] + ':', '```' + inlineM[2].toLowerCase(), inlineM[3], '```');
      continue;
    }

    // AI Mode sometimes prepends a topic-specific caution sentence directly
    // onto the same line as the regular disclaimer ("This is for
    // informational purposes only. For medical advice... AI responses may
    // include mistakes. Learn more") — strip that prefix first so the
    // regular disclaimer check below still recognizes what's left of the
    // line, instead of the whole line silently surviving as bogus content
    // because GEMINI_DISCLAIMER_RE anchors to the full line.
    if (GEMINI_TOPIC_CAUTION_RE.test(trimmed)) {
      const remainder = trimmed.replace(GEMINI_TOPIC_CAUTION_RE, '').trim();
      if (!remainder || GEMINI_DISCLAIMER_RE.test(remainder)) { out.push(' '); continue; }
    }

    if (GEMINI_DISCLAIMER_RE.test(trimmed))     { out.push(' '); continue; }
    if (GEMINI_CODE_CAUTION_RE.test(trimmed))   continue;
    if (GEMINI_SOURCES_HEADER_RE.test(trimmed)) continue;
    if (GEMINI_TIMESTAMP_RE.test(trimmed))      continue;

    out.push(line);
  }
  flushCode();

  return out.join('\n');
}

/**
 * Splits a cleaned Gemini/Google AI paste into {role, content} turns. Each
 * segment between disclaimer markers is one AI answer; within every segment
 * after the first, a short leading paragraph with no citation brackets is
 * treated as the user's next question (Gemini/Google AI answers reliably end
 * sentences with citation brackets like "[1, 2]", real user prompts don't).
 * The very first segment is assumed to be pure AI content, since a paste like
 * this is usually a mid-conversation excerpt starting on an answer already in
 * progress rather than the user's original opening prompt.
 */
function parseGeminiPaste(raw) {
  const cleaned  = cleanGeminiPaste(raw);
  const segments = cleaned.split(' ').map(s => s.trim()).filter(Boolean);
  if (!segments.length) return [];

  const messages = [];
  segments.forEach((segment, i) => {
    const paragraphs = segment.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    const first = paragraphs[0] || '';
    const looksLikeUserQuestion = i > 0 && paragraphs.length > 1 &&
      !CITATION_BRACKET_RE.test(first) && first.split(/\s+/).length <= 45;

    if (looksLikeUserQuestion) {
      messages.push({ role: 'You', content: first });
      messages.push({ role: 'Gemini', content: paragraphs.slice(1).join('\n\n') });
    } else {
      messages.push({ role: 'Gemini', content: segment });
    }
  });
  return messages;
}

/**
 * @param {string} raw
 * @returns {Array<{role:string, content:string}>}
 */
function parseImportedText(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];

  // 1. Explicit speaker labels at the start of a line, e.g. "You: ..." /
  //    "Gemini: ..." / "Q: ..." / "A: ...". The matched label (if longer than
  //    2 chars) becomes the role name as-is, so "Gemini:" → role "Gemini",
  //    "Google:" → role "Google", etc. Short/ambiguous labels ("a", "q")
  //    fall back to a generic "Assistant" role.
  const USER_LABEL = /^(you|me|user|prompt|question|q)\s*:\s*/i;
  const AI_LABEL   = /^(gemini|bard|google|ai|assistant|bot|chatgpt|claude|copilot|answer|a|response)\s*:\s*/i;

  const lines = text.split(/\r?\n/);
  const turns = [];
  let current = null;

  for (const line of lines) {
    const userM = line.match(USER_LABEL);
    const aiM   = !userM && line.match(AI_LABEL);
    if (userM) {
      if (current) turns.push(current);
      current = { role: 'You', content: line.slice(userM[0].length) };
    } else if (aiM) {
      if (current) turns.push(current);
      const label = aiM[1];
      const role  = label.length <= 2 ? 'Assistant' : label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
      current = { role, content: line.slice(aiM[0].length) };
    } else if (current) {
      current.content += (current.content ? '\n' : '') + line;
    } else {
      // Text before any recognized label — start an implicit "You" turn so
      // nothing gets silently dropped.
      current = { role: 'You', content: line };
    }
  }
  if (current) turns.push(current);

  const labeled = turns.map(m => ({ role: m.role, content: m.content.trim() })).filter(m => m.content);
  // Require at least two *distinct* roles before trusting this as a real
  // labeled conversation. Both USER_LABEL and AI_LABEL match a bare label
  // word anywhere a line happens to start with it — including inside a code
  // snippet or config example the AI included in its answer (e.g. a YAML/JSON
  // sample with a "user: ..." field, or a line starting with "Google" in
  // prose). A single such false match splits one long answer into two turns
  // that BOTH end up labeled "You" (USER_LABEL always assigns role 'You'
  // regardless of which recognized word matched), which used to be trusted
  // outright and skip the Gemini-aware cleanup and paragraph fallback below
  // entirely. A real back-and-forth paste always has at least two distinct
  // speakers, so collapsing to one role is a reliable signal this matched
  // spuriously — fall through to the next heuristics instead of trusting it.
  const distinctRoles = new Set(labeled.map(m => m.role));
  if (labeled.length >= 2 && distinctRoles.size >= 2) return labeled;

  // 2. Gemini/Google AI paste — recognizable boilerplate markers present.
  if (looksLikeGeminiPaste(text)) {
    const geminiMsgs = parseGeminiPaste(text);
    // Trust this over the generic paragraph-alternation fallback even for a
    // single resulting message — we've already recognized real Gemini/Google
    // AI boilerplate here, so falling back would just leave disclaimer/
    // caution-label junk sitting in the output as fake "turns".
    if (geminiMsgs.length >= 1) return geminiMsgs;
  }

  // 3. No explicit labels found — split on blank-line-separated paragraphs
  //    and alternate turns, assuming the paste starts with the user's prompt.
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length >= 2) {
    return paragraphs.map((content, i) => ({
      role: i % 2 === 0 ? 'You' : 'Assistant',
      content,
    }));
  }

  // 4. Last resort: the whole paste becomes a single message.
  return [{ role: 'You', content: text }];
}

// ─── Personal notes block ─────────────────────────────────────────────────────
// Returns a Markdown blockquote block to prepend to exports when the user has
// typed notes in the popup. Returns an empty string if notes is empty.
function notesBlockMD(notes) {
  if (!notes || !notes.trim()) return '';
  const lines = notes.trim().split('\n').map(l => `> ${l}`).join('\n');
  return `${lines}\n\n`;
}
