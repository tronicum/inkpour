# Inkpour — Planning & Architecture Notes

Last updated: 2026-07-05 (Tasks 1–47 complete)

## What it is

A Firefox/Chrome WebExtension (MV3) that extracts AI chat conversations from supported pages and exports them as Markdown, PDF, HTML, JSON, DOCX, or ZIP. A floating in-page button provides one-click export without opening the popup.

---

## Shipped features

### Core export pipeline
- **MD** download — full Markdown with optional YAML front matter + TOC + source URL
- **PDF** — opens `print.html` in a new tab, triggers browser print dialog
- **HTML** download — self-contained standalone HTML file (dark/light mode, no external deps)
- **JSON** download — structured `{ exporter, version, title, platform, messages[] }` schema
- **DOCX** download — rich OOXML: colored message blocks (indigo/green), native tables, embedded hyperlinks, task-list checkboxes, code blocks, attribution footer. Pure-JS, no server, no deps.
- **ZIP** download — `chat.md` + extracted code blocks as individual files (`snippet-N.ext`)
- **Copy MD** — copies Markdown to clipboard
- **Copy HTML** — copies full standalone HTML to clipboard

### Keyboard shortcuts
| Shortcut     | Action               |
|---|---|
| Alt+Shift+M  | Export Markdown      |
| Alt+Shift+P  | Export PDF           |
| Alt+Shift+D  | Export DOCX          |
| Alt+Shift+G  | Upload to GitHub Gist|
| Alt+Shift+C  | Copy Markdown        |
| (no key)     | Copy HTML            |
| (no key)     | Export JSON          |
| (no key)     | Export ZIP           |

Chrome caps extensions at 4 keyboard shortcuts; Firefox allows more.

### Right-click context menu
"Export with Inkpour" submenu → MD / Copy MD / JSON / ZIP / DOCX / Upload to Gist. Available on all pages; gracefully fails on unsupported ones.

### Markdown quality
- Bold (`**`), italic (`*`), strikethrough (`~~`), inline code (`` ` ``), code blocks (` ``` `)
- Headings h1–h6, unordered/ordered lists, nested lists
- Task lists (`- [x]` / `- [ ]`) → ☑/☐ in HTML and DOCX
- Tables (GFM pipe format, numeric columns right-aligned `--:`)
- Blockquotes, `<hr>` → `---`
- `<sup>/<sub>` → `^x^` / `~x~`
- `<img>` → `![alt](src)` (data: URIs noted as `[embedded image]`, blob: as `[blob image — not persistent]`)
- `<details><summary>` → `> **Label**` blockquote (Claude thinking blocks, reasoning traces)
- KaTeX `<span class="katex">` / MathJax `<mjx-container>` → `$…$` / `$$…$$`
- `<figure><figcaption>` → `![alt](src)\n*caption*`
- **Citation footnotes**: `<a href="..."><sup>N</sup></a>` or `<a>[N]</a>` → `[^N]` with `**Sources:**` section appended per message
- `<mark>` → **bold**, `<kbd>` → `code`, `<abbr title="…">` → word (definition)

### DOCX quality
Built from `mdToHTML()` output → `_htmlToOOXML()` for predictable structure.
- Colored message blocks: user = indigo (EEF2FF, accent 5B5BD6), AI = green (F0FDF4, accent 16A34A)
- `_wMsgLabel()`: small-caps colored role label with left-border accent
- Native OOXML tables (`<w:tbl>`) with gray header row, equal column widths
- Embedded hyperlinks registered in `word/_rels/document.xml.rels` (`TargetMode="External"`, rId3+)
- Task-list checkboxes: `☑` / `☐` with `<w:strike>` on completed items
- Code blocks: Courier New, light gray background shading
- Details/summary: blockquote paragraph with italic summary label
- Ordered + unordered lists with correct indent levels
- Attribution footer: centered italic "Exported with Inkpour" hyperlink (rId2)

### Filename templates
Tokens: `{platform}`, `{title}`, `{date}` (YYYY-MM-DD), `{time}` (HH-MM), `{url}` (page hostname), `{words}` (word count)
Default: `{platform}-{title}`

### Optional Markdown features (settings page)
- YAML front matter (title, platform, messages, words, date, source_url, exporter, reading_time_min)
- Table of contents (for chats > 4 messages, with numbered headings for unique GFM anchors)
- Obsidian tags: `tags: [ai-chat, {platform}]` appended to YAML front matter
- Downloads subfolder: all exports prepend a user-configured path (e.g. `AI Chats/`)

### Export history
- Last 20 exports stored in `storage.local` (rolling array)
- Starred exports stored separately (survive "Clear all")
- `history.html` page: searchable list with platform icons, color-coded format badges, re-download + copy + star buttons
- Stats bar: total exports, total words, top platform, top format

### Integrations
- **GitHub Gist** — PAT (gist scope) in Settings → "Gist ↑" popup button + `Alt+Shift+G` shortcut. Forces YAML front matter + searchable tags. Creates Gist and opens in new tab.
- **Webhook** — POST export metadata (+ optional full content) to any URL (n8n, Zapier, Make.com). Toggle "Include content" in Settings.

### Popup UX
- Platform chips (active highlighting when on a supported site)
- Eager extraction: DOM crawl on popup open → result cached, all export buttons reuse it
- Click status bar to re-extract (useful after streaming finishes)
- Message-count peek: "Ready · N messages · Xu/Ya · ~N words · ~Z min read · K code blocks"
- Last-export hint: "Last: claude · 12 msgs · MD · 2h ago" (persisted in `storage.local`)
- Editable export title field (pencil icon)
- Personal notes field (prepended as blockquote in MD / Gist exports, `notes` field in JSON)
- Selective export: checkbox list to pick specific turns; Quick-select: All / None / User / AI
- Action badge: shows "ON" on supported pages

### In-page floating button (Shadow DOM)
- Injected on all supported pages; isolated via `attachShadow({ mode: 'open' })`
- FAB (indigo circle, "ip") → expands menu: Export MD / Copy MD / Export HTML / Export DOCX / Export PDF / Export ZIP
- HTML, DOCX, PDF, ZIP route through `inPageExport` message to background.js (SW builds + downloads)
- Dark-mode aware (CSS `prefers-color-scheme`)
- SPA navigation: `MutationObserver` reinjects button on URL change

### Streaming guard
Before any extraction, content script checks for visible stop-button / spinner elements per platform. Returns `{ error, streaming: true }` → popup shows amber warning.

### Auto-scroll (lazy loading)
On ChatGPT, Gemini, and AI Studio: scrolls to top before extraction, waits for DOM stability (≤4 s), then restores scroll position.

### ZIP code extraction
Code blocks extracted from all messages → individual files (`snippet-1.py`, `snippet-2.js`, …). 30+ language → extension mappings. Pure-JS PKZIP STORED format.

---

## Platform support (20 platforms)

| Platform | Status | Extractor strategy |
|---|---|---|
| ChatGPT | ✅ Full | `[data-message-author-role]` |
| Claude | ✅ Full | `[data-testid="user-message"]` + `.font-claude-message` |
| Gemini | ✅ Full | `user-query` / `model-response` custom elements |
| Google AI Studio | ✅ Full | `ms-chat-turn` (async edit-mode for user prompts) |
| Google Search (AI Overview / AI Mode) | 🧪 Experimental | `.ai-overview`, `[data-attrid]`, `udm=50` multi-turn |
| Copilot | ✅ Full | `.group/user-message` / `cib-chat-turn` (legacy) |
| Grok | ✅ Full | `div[id^="response-"]` + `items-end` class detection |
| Groq Playground | 🧪 Experimental | `console.groq.com/playground`; Next.js SPA, multiple selector fallbacks |
| Perplexity | 🧪 Experimental | `[data-testid="answer"]` + `.prose` child; citation footnotes |
| DeepSeek | 🧪 Experimental | `[data-role]` attributes |
| Meta AI | 🧪 Experimental | `[data-message-author]` attributes |
| Mistral Le Chat | 🧪 Experimental | `[data-role]` attributes |
| HuggingChat | 🧪 Experimental | `[data-message-role]` attributes |
| Poe | 🧪 Experimental | `[class*="Message_humanMessageBubble"]` CSS module names |
| Phind | 🧪 Experimental | `[class*="userMessage"]` / `[class*="phindAnswer"]` |
| NotebookLM | 🧪 Experimental | `[data-message-role]` attributes |
| Kagi Assistant | 🧪 Experimental | `[data-role]` / class patterns |
| Z.ai (Zhipu GLM) | 🧪 Experimental | `.chat-user` / `.chat-assistant #response-content-container` |
| Venice.ai | 🧪 Experimental | `.assistant-content .prose` / `[class*="userMessage"]`; chakra-stack fallback |

---

## Architecture

```
inkpour/
├── manifest.json           MV3, 21 host_permissions, 8 commands
├── src/content.js          Extraction + htmlToMarkdown + in-page button (~1500 lines)
├── src/utils.js            Shared builders: buildMarkdown, buildDocx, buildZip, mdToHTML, …
├── popup.html / popup.js   Export buttons (MD/PDF/HTML/JSON/ZIP/DOCX + Copy MD/HTML + Gist)
├── background.js           Service worker: shortcuts + context menu + download handler
├── settings.html / .js     Options page (defaultFormat, YAML, TOC, filenameTemplate, Gist, webhook)
├── print.html / print.js   PDF print tab (reads localStorage OR storage.local)
├── history.html / .js      Export history page (search, re-download, copy, star, clear)
├── PRIVACY.md              Privacy policy for store submission
├── supported-sites.json    Machine-readable platform list
├── icons/                  16/32/48/128px PNGs
└── test/
    ├── run-jsdom.js        JSDOM test harness (159 tests, 0 failures)
    └── fixtures/           17 HTML fixtures (one per platform)
```

### Key design decisions

**Shared utilities** (`src/utils.js`): all builder functions live here — `buildMarkdown`, `buildDocx`, `buildFilename`, `buildJSON`, `buildPrintBodyHTML`, `buildStandaloneHTML`, `buildZip`, `buildZipExport`, `esc`, `mdToHTML`, `uint8ToBase64`. Loaded via `<script src="src/utils.js">` in popup pages and `importScripts('src/utils.js')` in the service worker.

**Single content script** (`src/content.js` IIFE): all extraction logic in one file — no module bundler needed, simpler for extension review.

**Shadow DOM for in-page button**: prevents host-page CSS leaking into the Inkpour UI.

**DOCX from HTML**: `mdToHTML()` converts markdown → predictable HTML → `_htmlToOOXML()` parses it into OOXML runs. Avoids fragile regex-on-markdown parsing. Hyperlinks collected in `_docxLinks[]` during body build, then appended to `docRels` after.

**`window.__inkpourTestHostname`**: test escape hatch so `detectSite()` routes correctly in JSDOM.

**JSDOM test harness** (`test/run-jsdom.js`): 134 tests, 0 failures. `npm test` runs this.

**print.js dual-source**: popup sets `localStorage.inkpour_print` (synchronous); background SW sets `storage.local.inkpour_print_pending` (async). `print.js` checks localStorage first.

**ZIP format**: pure-JS PKZIP uncompressed (method 0 = STORED). CRC32 with polynomial `0xEDB88320`. Background SW uses chunked `btoa()` for large chats.

---

## Known limitations

- Selectors for experimental platforms need verification against real live pages
- AI Studio extraction is fragile (edit-mode clicks may misfire on complex prompts)
- Footnote `[^N]` numbers restart per-message — could conflict in multi-turn Perplexity exports
- Context menu appears on all pages (MV3 limitation without exact `documentUrlPatterns`)
- Safari support possible via `xcrun safari-web-extension-converter` → Xcode → App Store

## Next ideas
- NotebookLM source citation extraction (inline `[1]` refs to uploaded docs)
- i18n: `_locales/en/messages.json` groundwork
- Kagi / Groq selector verification against real pages
- Obsidian vault path setting → export directly there via Downloads API
- Streaming progress: show "Extracting…" while auto-scroll runs
- Lifetime stats storage: persist cumulative stats beyond 20-entry rolling window
- HTML in-page button option (route through background.js like DOCX/PDF/ZIP)
- `{msgcount}` filename token
