# Inkpour — Planning & Architecture Notes

Last updated: 2026-07-06 (Tasks 1–50 complete)

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

## Platform support (24 platforms)

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
| Perplexity | 🧪 Experimental | `.prose` (answer-container wrappers removed 2026-07 — no longer exist live) + citation footnotes |
| DeepSeek | 🧪 Experimental | `[data-role]` attributes |
| Meta AI | 🧪 Experimental | `[data-message-author]` attributes; manifest now also matches `www.meta.ai` |
| Mistral Le Chat | 🧪 Experimental | `[data-role]` attributes |
| HuggingChat | 🧪 Experimental | `[data-message-role]` attributes |
| Poe | 🧪 Experimental | `[class*="Message_humanMessageBubble"]` CSS module names |
| NotebookLM | 🧪 Experimental | `<chat-message>` custom element + `.from-user-container`/`.to-user-container` (rebranded "Gemini Notebook", 2026-07) |
| Kagi Assistant | 🧪 Experimental | `[data-role]` / class patterns |
| Z.ai (Zhipu GLM) | 🧪 Experimental | `.chat-user` / `.chat-assistant #response-content-container` |
| Venice.ai | 🧪 Experimental | `.assistant .prose` (AI) / `.assistant-content .prose` not under `.assistant` (agent UI) or `[data-testid="user-message"]` (classic UI) — rewritten 2026-07 |
| Chatbot Arena (LMArena / Arena AI) | 🧪 Experimental | now redirects to `arena.ai`; `.justify-end .prose` (user) verified live 2026-07, response side reCAPTCHA-gated |
| Character.AI | 🧪 Experimental | `[data-author-name]` (primary); `[class*="UserMessage"]` / `[class*="CharacterMessage"]` fallback |
| Cohere Coral | 🧪 Experimental | `[data-testid="user-message"]` / `[data-testid="assistant-message"]` |
| Pi.AI | 🧪 Experimental | `[data-role="human"]` / `[data-role="pi"]` |

---

## Architecture

```
inkpour/
├── manifest.json           MV3, 28 host_permissions, 8 commands
├── src/content.js          Extraction + htmlToMarkdown + in-page button (~1500 lines)
├── src/utils.js            Shared builders: buildMarkdown, buildDocx, buildZip, mdToHTML, …
├── popup.html / popup.js   Export buttons (MD/PDF/HTML/JSON/ZIP/DOCX + Export All + Copy MD/HTML + Gist)
├── background.js           Service worker: shortcuts + context menu + download handler
├── settings.html / .js     Options page (defaultFormat, YAML, TOC, filenameTemplate, Gist, webhook)
├── print.html / print.js   PDF print tab (reads localStorage OR storage.local)
├── history.html / .js      Export history page (fuzzy search, re-download, copy, star, clear)
├── safari/                 Safari Web Extension scaffold → xcrun safari-web-extension-converter → Xcode → App Store
├── PRIVACY.md              Privacy policy for store submission
├── supported-sites.json    Machine-readable platform list (24 entries)
├── icons/                  16/32/48/128px PNGs
└── test/
    ├── run-jsdom.js        JSDOM test harness (189 tests, 0 failures)
    └── fixtures/           19 HTML fixtures (one per platform)
```

### Key design decisions

**Shared utilities** (`src/utils.js`): all builder functions live here — `buildMarkdown`, `buildDocx`, `buildFilename`, `buildJSON`, `buildPrintBodyHTML`, `buildStandaloneHTML`, `buildZip`, `buildZipExport`, `esc`, `mdToHTML`, `uint8ToBase64`. Loaded via `<script src="src/utils.js">` in popup pages and `importScripts('src/utils.js')` in the service worker.

**Single content script** (`src/content.js` IIFE): all extraction logic in one file — no module bundler needed, simpler for extension review.

**Shadow DOM for in-page button**: prevents host-page CSS leaking into the Inkpour UI.

**DOCX from HTML**: `mdToHTML()` converts markdown → predictable HTML → `_htmlToOOXML()` parses it into OOXML runs. Avoids fragile regex-on-markdown parsing. Hyperlinks collected in `_docxLinks[]` during body build, then appended to `docRels` after.

**`window.__inkpourTestHostname`**: test escape hatch so `detectSite()` routes correctly in JSDOM.

**JSDOM test harness** (`test/run-jsdom.js`): 189 tests, 0 failures. `npm test` runs this.

**print.js dual-source**: popup sets `localStorage.inkpour_print` (synchronous); background SW sets `storage.local.inkpour_print_pending` (async). `print.js` checks localStorage first.

**ZIP format**: pure-JS PKZIP uncompressed (method 0 = STORED). CRC32 with polynomial `0xEDB88320`. Background SW uses chunked `btoa()` for large chats.

---

## Known limitations

- Experimental-platform selector status (live-tested 2026-07):
  - **Verified working**: Perplexity, NotebookLM, Venice.ai, arena.ai (ex-lmarena; response side reCAPTCHA-gated), Meta AI (incl. `www.meta.ai`), Character.AI
  - **Unverifiable without a logged-in account** — terminal, not a TODO: Poe, Kagi Assistant, Cohere Coral, Groq Playground, DeepSeek all sit behind login walls that automated verification can't pass. Selectors ship as best-effort; only Stefan testing in his own browser would change this.
  - **Not yet live-tested**: Mistral Le Chat, HuggingChat, Z.ai, Pi.AI
- Google AI Mode extractor duplicates every turn + leaks page furniture into message bodies — real bug, scored M in `TODOs.md` Batch 2
- AI Studio extraction is fragile (edit-mode clicks may misfire on complex prompts)
- Footnote `[^N]` numbers restart per-message — conflicts in multi-turn Perplexity exports (fix scored S in `TODOs.md` Batch 3)
- Context menu appears on all pages (fixable with `documentUrlPatterns` built from `supported-sites.json` — scored S in `TODOs.md` Batch 4)
- RTL locales (ar/fa) render LTR — CSS assumes LTR throughout (deferred in `TODOs.md` until those locales see usage)

## Backlog

The full backlog — every open engineering item, complexity-scored (XS–XL) and
grouped into session-sized batches — lives in `planning/TODOs.md`. This file
stays a pure engineering reference; don't add new ideas here.

Done / dead items formerly listed here:
- ~~i18n groundwork~~ — done. 26 locales shipped (en + de, zh_CN, zh_TW, es, hi, ar, pt_BR, ru, ja, fr, id, vi, ko, tr, it, fa, pl, uk, bn, nl, th, pa, sv, cs, el). manifest.json uses `__MSG_x__` + `default_locale`; all HTML pages wired via `src/i18n.js` (`data-i18n*` + `InkpourI18n.applyI18n()`); dynamic JS strings use `api.i18n.getMessage()`. RTL follow-up tracked in TODOs.md.
- ~~`{msgcount}` filename token~~ — done and fully wired: all `buildFilename()` call sites pass message count, documented in settings.html, covered by tests.
- ~~Obsidian vault path via Downloads API~~ — dead as specified: the Downloads API can't write outside the Downloads folder (the existing subfolder setting already covers the in-Downloads case). Superseded by File System Access API item, TODOs.md Batch 6.
- ~~Kagi / Groq selector verification~~ — closed as unverifiable without an account (see Known limitations above).
