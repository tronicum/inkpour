#!/usr/bin/env node
/**
 * bookmarklet/build.js — builds the installable Inkpour mobile bookmarklet.
 *
 * Dependency-free Node script (no bundler, no minifier package — see the
 * task's explicit "no new dependencies" constraint). It:
 *
 *   1. Reads bookmarklet/src/inkpour-bookmarklet.js.
 *   2. Lightly strips comments and leading/trailing line whitespace. This is
 *      DELIBERATELY conservative, not a real minifier: it only removes
 *      whole-line `//` comments and `/* ... *\/` blocks (including inline
 *      ones), and trims line edges. It never touches string/template
 *      literal *contents* (in particular, it must not collapse the
 *      significant `'  '` two-space indent literal in convertList(), and
 *      must not misparse a `//` inside a URL sitting in a template literal
 *      as a comment). Correctness over byte count.
 *   3. Appends a call to runInkpourBookmarklet() — the source file itself
 *      never calls this, precisely so loading it in tests has no side
 *      effects (see the header comment in inkpour-bookmarklet.js).
 *   4. Wraps the whole thing in `(function(){ ... })()`, URI-encodes it,
 *      and prefixes it with `javascript:`.
 *   5. Writes bookmarklet/dist/inkpour.bookmarklet.txt (the raw URI) and
 *      bookmarklet/dist/install.html (a human-friendly install page).
 *
 * Run with: node bookmarklet/build.js  (wired as `npm run build:bookmarklet`)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, 'src', 'inkpour-bookmarklet.js');
const DIST_DIR = path.join(__dirname, 'dist');
const TXT_PATH = path.join(DIST_DIR, 'inkpour.bookmarklet.txt');
const HTML_PATH = path.join(DIST_DIR, 'install.html');

/**
 * Lightly strip comments and trim line whitespace from a JS source string.
 * See the file header above for exactly what this does and does not do.
 * Exported so tests can call it directly against the real source file.
 */
function lightlyStripComments(source) {
  const lines = source.split('\n');
  const out = [];
  let inBlockComment = false;

  for (let raw of lines) {
    let line = raw;

    if (inBlockComment) {
      const closeIdx = line.indexOf('*/');
      if (closeIdx === -1) {
        // Entire line is still inside the block comment — drop it.
        continue;
      }
      // Comment closes partway through this line; keep whatever follows.
      line = line.slice(closeIdx + 2);
      inBlockComment = false;
    }

    let trimmed = line.trim();

    // Whole-line "//" comment (only when // is the very first thing on the
    // line, so a "//" inside a URL elsewhere on a code line is never
    // touched by this branch).
    if (trimmed.startsWith('//')) continue;

    // Whole-line block comment opener, e.g. "/**" or "/* foo" with no
    // closer on the same line.
    if (trimmed.startsWith('/*')) {
      const closeIdx = trimmed.indexOf('*/');
      if (closeIdx === -1) {
        inBlockComment = true;
        continue;
      }
      // Rare one-liner like "/* foo */" possibly followed by code.
      trimmed = trimmed.slice(closeIdx + 2).trim();
      line = trimmed;
    }

    // Inline block comments fully contained within a single code line,
    // e.g. `if (node.nodeType === 3 /* TEXT_NODE */) return ...;`.
    // Safe here because this codebase never puts literal "/*"..."*/" text
    // inside a string or template literal — verified by hand for this file.
    line = line.replace(/\/\*[^*]*\*\//g, '');

    const finalTrimmed = line.trim();
    if (finalTrimmed === '') continue;

    out.push(finalTrimmed);
  }

  return out.join(' ');
}

/**
 * Builds the full javascript: URI from the raw source text.
 * Exported so tests can exercise it without touching the filesystem.
 */
function buildBookmarkletUri(source) {
  const stripped = lightlyStripComments(source);
  const wrapped = `(function(){${stripped} runInkpourBookmarklet();})();`;
  return 'javascript:' + encodeURIComponent(wrapped);
}

function buildInstallHtml(bookmarkletUri) {
  const escapedUri = bookmarkletUri.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Install the Inkpour bookmarklet</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; line-height: 1.5; }
  a.bookmarklet { display: inline-block; padding: 10px 18px; background: #111; color: #fff; border-radius: 8px; text-decoration: none; font-weight: bold; }
  code, .code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  ol { padding-left: 1.2em; }
  li { margin-bottom: 8px; }
</style>
</head>
<body>
<h1>Inkpour — mobile bookmarklet</h1>
<p>
  Drag this link to your bookmarks bar (desktop), or follow the manual steps
  below on iOS Safari / Android Chrome — mobile browsers don't let you drag
  links into bookmarks, so you'll paste the code into a saved bookmark's URL
  instead.
</p>
<p>
  <a class="bookmarklet" href="${escapedUri}">Inkpour: Copy chat as Markdown</a>
</p>
<h2>Install on iOS Safari</h2>
<ol>
  <li>Open this page in Safari, then tap the Share icon and choose <strong>Add Bookmark</strong> (bookmarking any page works — you'll overwrite its URL next).</li>
  <li>Go to Safari's Bookmarks list, tap <strong>Edit</strong>, then tap the bookmark you just created.</li>
  <li>Change its <strong>Title</strong> to something like <code>Inkpour: Copy MD</code>.</li>
  <li>Tap the URL field, select all the existing text, delete it, then paste the bookmarklet code below in its place.</li>
  <li>Tap <strong>Done</strong>. Open ChatGPT or Claude in Safari, tap the bookmark from your bookmarks list, and the conversation is copied as Markdown.</li>
</ol>
<h2>Install on Android Chrome</h2>
<ol>
  <li>Open this page in Chrome, tap the star/bookmark icon (or the &#8942; menu &rarr; <strong>Add to bookmarks</strong>).</li>
  <li>Open Chrome's menu &rarr; <strong>Bookmarks</strong>, find the bookmark, tap the three-dot menu next to it and choose <strong>Edit</strong>.</li>
  <li>Change the <strong>Name</strong> to <code>Inkpour: Copy MD</code>.</li>
  <li>Clear the <strong>URL</strong> field and paste the bookmarklet code below in its place.</li>
  <li>Save. Open ChatGPT or Claude in Chrome, open bookmarks, tap the entry, and the conversation is copied as Markdown.</li>
</ol>
<h2>The code to paste</h2>
<p>Copy the entire line below (it's one long <code>javascript:</code> URI):</p>
<textarea readonly style="width:100%;height:160px;font-family:monospace;font-size:11px;" onclick="this.select()">${bookmarkletUri}</textarea>
<h2>Supported pages</h2>
<p>ChatGPT (chatgpt.com / chat.openai.com) and Claude (claude.ai) only. Tapping the bookmarklet on any other page shows an "unsupported page" alert.</p>
<h2>Limitations vs. the full extension</h2>
<ul>
  <li>Copies Markdown to the clipboard only — no PDF, HTML, JSON, DOCX, or ZIP export, and no file downloads.</li>
  <li>No settings, history, YAML front matter, or table of contents.</li>
  <li>Exports only what's currently rendered in the DOM — it does not scroll to load older messages.</li>
  <li>If the clipboard write is blocked by the browser, a copy-from-textarea overlay appears instead — a manual "Copy" tap still gets the Markdown onto your clipboard.</li>
</ul>
<p>See <a href="https://github.com/tronicum/inkpour/tree/main/bookmarklet">bookmarklet/README.md</a> in the repo for full details, or install the <a href="https://github.com/tronicum/inkpour#readme">real Inkpour extension</a> if your browser supports WebExtensions (including Orion on iOS).</p>
</body>
</html>
`;
}

function main() {
  const source = fs.readFileSync(SRC_PATH, 'utf8');
  const uri = buildBookmarkletUri(source);

  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(TXT_PATH, uri, 'utf8');
  fs.writeFileSync(HTML_PATH, buildInstallHtml(uri), 'utf8');

  console.log(`Wrote ${path.relative(process.cwd(), TXT_PATH)} (${uri.length} bytes)`);
  console.log(`Wrote ${path.relative(process.cwd(), HTML_PATH)}`);
}

// Export for tests (plain CommonJS module — this file is run directly via
// `node bookmarklet/build.js`, and also required as a module in
// test/run-jsdom.js to exercise lightlyStripComments/buildBookmarkletUri
// without spawning a child process).
module.exports = { lightlyStripComments, buildBookmarkletUri, buildInstallHtml };

if (require.main === module) {
  main();
}
