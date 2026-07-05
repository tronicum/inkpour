/**
 * src/utils.js — Inkpour shared utilities
 *
 * Loaded by popup.html via <script> and by background.js via importScripts().
 * All functions are declared at global scope so they work in both contexts.
 * Do NOT add anything that depends on DOM, localStorage, or extension APIs here.
 */

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

  // 5. Horizontal rule
  md = md.replace(/^---$/gm, '<hr>');

  // 6. Blockquotes
  md = md.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // 7. Lists — group consecutive list lines
  md = md.replace(/((?:^\* .+$\n?)+)/gm, match => {
    const items = match.trim().split('\n')
      .map(l => `<li>${l.replace(/^\* /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });
  md = md.replace(/((?:^\d+\. .+$\n?)+)/gm, match => {
    const items = match.trim().split('\n')
      .map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
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
    const urlLine  = sourceUrl ? `\nsource_url: "${sourceUrl}"` : '';
    const tagsLine = opts.obsidianTags ? `\ntags: [ai-chat, ${site}]` : '';
    md += `---\ntitle: "${safeTitle}"\nplatform: ${site}\nmessages: ${messages.length}\nwords: ${wordCount}\nreading_time_min: ${readingMin}\ndate: ${isoDate}${urlLine}${tagsLine}\nexporter: inkpour\n---\n\n`;
  }

  md += `# ${title}\n\n`;
  const srcNote = sourceUrl ? ` · [source](${sourceUrl})` : '';
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
  return md;
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
    .replace(/[^a-z0-9_\-]+/gi, '-')
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
  if (props.bold)   rpr.push('<w:b/>');
  if (props.italic) rpr.push('<w:i/>');
  if (props.strike) rpr.push('<w:strike/>');
  if (props.color)  rpr.push(`<w:color w:val="${props.color}"/>`);
  if (props.code) {
    rpr.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>');
    rpr.push('<w:sz w:val="18"/><w:szCs w:val="18"/>');
    rpr.push('<w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/>');
  }
  const rprXml = rpr.length ? `<w:rPr>${rpr.join('')}</w:rPr>` : '';
  return `<w:r>${rprXml}<w:t xml:space="preserve">${_xmlEsc(text)}</w:t></w:r>`;
}

/**
 * Build a <w:p> paragraph with optional style and inner run XML.
 */
function _wPara(runs, style = '', extraPPr = '') {
  const ppr = (style || extraPPr)
    ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extraPPr}</w:pPr>`
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
 * Code block: one paragraph per line, monospaced, light-gray background.
 * Lines are joined with <w:br/> inside a single paragraph for compactness.
 */
function _wCodeBlock(text, _lang) {
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
  return `<w:p>${pPr}${runs}</w:p>`;
}

/**
 * Convert markdown content string to a series of OOXML paragraph elements.
 */
function _mdToOOXML(content) {
  const lines = content.split('\n');
  const out   = [];
  let inFence = false;
  let fenceLines = [];
  let fenceLang  = '';

  for (const raw of lines) {
    // ── Code fence ──
    if (/^```/.test(raw)) {
      if (!inFence) {
        inFence    = true;
        fenceLang  = raw.slice(3).trim();
        fenceLines = [];
      } else {
        inFence = false;
        out.push(_wCodeBlock(fenceLines.join('\n'), fenceLang));
        fenceLines = [];
      }
      continue;
    }
    if (inFence) { fenceLines.push(raw); continue; }

    // ── Headings ──
    const hm = raw.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      const styleMap = ['', 'Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6'];
      out.push(_wPara(_mdInlineToRuns(hm[2]), styleMap[hm[1].length] || 'Heading3'));
      continue;
    }

    // ── Horizontal rule ──
    if (/^-{3,}$/.test(raw.trim())) { out.push(_wHRule()); continue; }

    // ── Blockquote ──
    // IntenseQuote is a standard OOXML built-in — renders as indented italic in Word/Pages.
    if (/^> /.test(raw)) {
      out.push(_wPara(_mdInlineToRuns(raw.slice(2)), 'IntenseQuote'));
      continue;
    }

    // ── Unordered list ──
    if (/^[*\-] /.test(raw)) {
      const inner = _mdInlineToRuns(raw.replace(/^[*\-] /, ''));
      const bullet = _wRun('• ', { bold: false });
      out.push(_wPara(bullet + inner, '', '<w:ind w:left="440" w:hanging="280"/>'));
      continue;
    }

    // ── Ordered list ──
    const olm = raw.match(/^(\d+)\. (.+)$/);
    if (olm) {
      const inner  = _mdInlineToRuns(olm[2]);
      const prefix = _wRun(`${olm[1]}. `);
      out.push(_wPara(prefix + inner, '', '<w:ind w:left="440" w:hanging="280"/>'));
      continue;
    }

    // ── Empty line ──
    if (!raw.trim()) { out.push(_wPara('', '', '<w:spacing w:before="0" w:after="60"/>')); continue; }

    // ── Normal paragraph ──
    out.push(_wPara(_mdInlineToRuns(raw)));
  }

  // Flush an open fence (malformed markdown)
  if (inFence && fenceLines.length) out.push(_wCodeBlock(fenceLines.join('\n'), fenceLang));

  return out.join('\n');
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
  const date     = new Date().toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const wordCount = messages
    .map(m => m.content.trim().split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => a + b, 0);
  const srcNote  = sourceUrl ? ` · ${sourceUrl}` : '';
  const metaText = `Exported from ${site} on ${date} · ${messages.length} messages · ~${wordCount.toLocaleString()} words${srcNote}`;

  // ── Body paragraphs ──────────────────────────────────────────────────────
  let body = '';

  // Document title
  body += _wPara(_wRun(title), 'Heading1');

  // Metadata
  body += _wPara(_wRun(metaText, { italic: true, color: '71717A' }), '', '<w:spacing w:after="240"/>');

  // Messages
  for (const { role, content } of messages) {
    body += _wHRule();
    // Role heading
    body += _wPara(_wRun(role), 'Heading2');
    // Content
    body += _mdToOOXML(content.trim());
    body += _wPara('', '', '<w:spacing w:after="120"/>'); // trailing spacer
  }

  // Section properties (A4 page)
  body += `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;

  // ── OOXML files ──────────────────────────────────────────────────────────
  const NS_W   = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const NS_PKG = 'http://schemas.openxmlformats.org/package/2006';
  const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

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

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_PKG}/relationships">
  <Relationship Id="rId1" Type="${NS_REL}/styles" Target="styles.xml"/>
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

</w:styles>`;

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS_W}">
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
