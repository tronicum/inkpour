# Inkpour — Planning & Architecture Notes

Last updated: 2026-07-05 (Tasks 1–32 complete)

## What it is

A Firefox/Chrome WebExtension (MV3) that extracts AI chat conversations from supported pages and exports them as Markdown, PDF, HTML, JSON, or ZIP. A floating in-page button provides one-click export without opening the popup.

---

## Shipped features

### Core export pipeline
- **MD** download — full Markdown with optional YAML front matter + TOC + source URL
- **PDF** — opens `print.html` in a new tab, triggers browser print dialog
- **HTML** download — self-contained standalone HTML file (dark/light mode)
- **JSON** download — structured `{ exporter, version, title, platform, messages[] }` schema
- **ZIP** download — `chat.md` + extracted code blocks as individual files (`snippet-N.ext`)
- **Copy MD** — copies Markdown to clipboard
- **Copy HTML** — copies full standalone HTML to clipboard

### Keyboard shortcuts
| Shortcut     | Action               |
|---|---|
| Alt+Shift+M  | Export Markdown      |
| Alt+Shift+P  | Export PDF           |
| Alt+Shift+C  | Copy Markdown        |
| Alt+Shift+H  | Copy HTML            |
| Alt+Shift+J  | Export JSON          |
| Alt+Shift+Z  | Export ZIP           |

### Right-click context menu
"Export with Inkpour" submenu → MD / Copy MD / JSON / ZIP. Available on all pages; gracefully fails on unsupported ones.

### Markdown quality
- Bold (`**`), italic (`*`), strikethrough (`~~`), inline code (`` ` ``), code blocks (` ``` `)
- Headings h1–h6, unordered/ordered lists, nested lists
- Tables (GFM pipe format, numeric columns right-aligned `--:`)
- Blockquotes, `<hr>` → `---`
- `<sup>/<sub>` → `^x^` / `~x~`
- `<img>` → `![alt](src)` (data: URIs noted as `[embedded image]`, blob: as `[blob image — not persistent]`)
- `<details><summary>` → `> **Label**` blockquote (Claude thinking blocks, reasoning traces)
- KaTeX `<span class="katex">` / MathJax `<mjx-container>` → `$…$` / `$$…$$`
- `<figure><figcaption>` → `![alt](src)\n*caption*`
- **Citation footnotes**: `<a href="..."><sup>N</sup></a>` or `<a>[N]</a>` → `[^N]` with `**Sources:**` section appended per message

### Filename templates
Tokens: `{platform}`, `{title}`, `{date}` (YYYY-MM-DD), `{time}` (HH-MM), `{url}` (page hostname)
Default: `{platform}-{title}`

### Optional Markdown features (settings page)
- YAML front matter (title, platform, messages, words, date, source_url, exporter)
- Table of contents (for chats > 4 messages, with numbered headings for unique GFM anchors)
- Obsidian tags: `tags: [ai-chat, {platform}]` appended to YAML front matter when enabled
- Downloads subfolder: all exports (MD/JSON/ZIP) prepend a user-configured path (e.g. `AI Chats/`)

### Export history
- Last 20 exports stored in `storage.local` (rolling array)
- `history.html` page: searchable list with platform icons, color-coded format badges, re-download + copy buttons
- Stats bar: total exports, total words, top platform, top format (computed from stored entries)
- Accessible from popup footer or keyboard

### Popup UX
- Platform chips (active highlighting when on a supported site)
- Message-count peek on open: "Ready · N messages · Xu/Ya · ~N words · Z code blocks"
- Last-export hint: "Last: claude · 12 msgs · MD · 2h ago" (persisted in `storage.local`)
- Status classes: success (green) / error (red) / warning (amber, used for streaming guard)
- Source URL included in markdown preamble blockquote when available

### In-page floating button (Shadow DOM)
- Injected on all supported pages; isolated via `attachShadow({ mode: 'open' })`
- FAB (indigo circle, "ip") → expands menu: Export MD, Copy MD
- Dark-mode aware (CSS `prefers-color-scheme`)
- SPA navigation: `MutationObserver` reinjects button on URL change

### Streaming guard
Before any extraction, content script checks for visible stop-button elements per platform. Returns `{ error, streaming: true }` → popup shows amber warning instead of error.

### Auto-scroll (lazy loading)
On ChatGPT, Gemini, and AI Studio: scrolls to top before extraction, waits for DOM stability (≤4 s), then restores scroll position. JSDOM guard prevents errors in tests.

### ZIP code extraction
When exporting ZIP, code blocks are extracted from all messages and saved as individual files:
- Language hint from fence (e.g., ` ```python`) → `.py` extension
- 30+ languages supported; unknown → `.txt`
- Counter per extension: `snippet-1.py`, `snippet-2.py`, `snippet-1.js`, etc.
- Background service worker uses `btoa()` + `data:` URL for ZIP download (no `createObjectURL` in SW)

---

## Platform support (15 platforms)

| Platform | Status | Extractor strategy |
|---|---|---|
| ChatGPT | ✅ Full | `[data-message-author-role]` |
| Claude | ✅ Full | `[data-testid="user-message"]` + `.font-claude-message` |
| Gemini | ✅ Full | `user-query` / `model-response` custom elements |
| Google AI Studio | ✅ Full | `ms-chat-turn` (async edit-mode for user prompts) |
| Copilot | ✅ Full | `.group/user-message` / `cib-chat-turn` (legacy) |
| Grok | ✅ Full | `div[id^="response-"]` + `items-end` class detection |
| Perplexity | 🧪 Experimental | `[data-testid="answer"]` + `.prose` child; citation footnotes |
| DeepSeek | 🧪 Experimental | `[data-role]` attributes |
| Meta AI | 🧪 Experimental | `[data-message-author]` attributes |
| Mistral | 🧪 Experimental | `[data-role]` attributes |
| HuggingChat | 🧪 Experimental | `[data-message-role]` attributes |
| Poe | 🧪 Experimental | `[class*="Message_humanMessageBubble"]` CSS module names |
| Phind | 🧪 Experimental | `[class*="userMessage"]` / `[class*="phindAnswer"]` |
| NotebookLM | 🧪 Experimental | `[data-message-role]` attributes |
| Kagi | 🧪 Experimental | `[data-role]` / class patterns |

---

## Architecture

```
inkpour/
├── manifest.json           MV3, 15 host_permissions, 6 commands
├── src/content.js          Extraction + htmlToMarkdown + in-page button (~1000 lines)
├── popup.html / popup.js   7 export buttons (MD/PDF/HTML/JSON/ZIP + Copy MD/HTML)
├── background.js           Service worker: shortcuts + context menu + ZIP builder
├── settings.html / .js     Options page (defaultFormat, YAML, TOC, filenameTemplate)
├── print.html / print.js   PDF print tab (reads localStorage OR storage.local)
├── history.html / .js      Export history page (search, re-download, copy, clear)
├── icons/                  16/32/48/128px PNGs
└── test/
    ├── run-jsdom.js        JSDOM test harness (70 tests, 0 failures)
    └── fixtures/           15 HTML fixtures (one per platform)
```

### Key design decisions

**Single content script** (`src/content.js` IIFE): all extraction logic in one file — no module bundler needed, simpler for extension review. Trade-off: popup.js and background.js duplicate `buildMarkdown`/`buildFilename`/`buildJSON`/`buildZip`. Acceptable for current scale.

**Shadow DOM for in-page button**: prevents host-page CSS leaking into the Inkpour UI. The shadow root has `mode: 'open'` (allows debugging), `all: initial` resets inherited styles.

**`window.__inkpourTestHostname`**: test escape hatch so `detectSite()` routes correctly in JSDOM. Zero impact on real browser runs.

**JSDOM test harness** (`test/run-jsdom.js`): Playwright can't install system deps in the sandbox. JSDOM runs all extraction tests without a real browser. 70 tests, 0 failures. `npm test` runs this.

**Citation footnotes**: module-level `_footnotes` array, reset per `htmlToMarkdown()` call. Same URL cited multiple times → same footnote number (indexOf dedup). Per-message footnote definitions — if two responses both have `[^1]`, most renderers use the last definition (known limitation, acceptable).

**`<details>` handling**: children iterated directly (not via `convertNode(clone)`) to avoid infinite recursion since the clone would be a `<details>` element and hit the same case again.

**print.js dual-source**: popup sets `localStorage.inkpour_print` (synchronous, extension-origin shared); background SW sets `storage.local.inkpour_print_pending` (async, cross-context). `print.js` checks localStorage first, then falls back to storage.local.

**ZIP format**: pure-JS PKZIP uncompressed (method 0 = STORED). CRC32 computed with the standard polynomial `0xEDB88320`. No external libraries. Background SW uses `btoa(String.fromCharCode(...zipBytes))` to convert `Uint8Array` → base64 for `data:application/zip` URL since `URL.createObjectURL` is unavailable in service workers.

---

## Known limitations

- Selectors for experimental platforms need verification against real live pages
- Promote experimental → full once selectors confirmed stable
- AI Studio extraction is fragile (edit-mode clicks may misfire on complex prompts)
- `buildMarkdown` / `buildFilename` / `buildJSON` / `buildZip` duplicated across popup.js and background.js — candidate for a shared `src/utils.js` (needs a build step or dynamic import)
- In-page button only exports MD + Copy MD; PDF/JSON/ZIP remain popup-only
- Context menu appears on all pages (MV3 limitation without exact `documentUrlPatterns`)
- Footnote `[^N]` numbers restart per-message — could conflict in multi-turn Perplexity exports
- ZIP base64 approach in SW may hit `btoa()` stack limit for very large chats (> ~32MB) — solution: chunked encoding
- Safari support possible via `xcrun safari-web-extension-converter` → Xcode → App Store

## Next ideas
- NotebookLM source citation extraction (inline `[1]` refs to uploaded docs)
- i18n: `_locales/en/messages.json` groundwork
- Kagi selector verification against real kagi.com/assistant
- Obsidian vault path setting → export directly there via Downloads API (subfolder is now wired)
- GitHub Gist upload (with user-configured token)
- Streaming progress: show "Extracting…" while auto-scroll runs
- Lifetime stats storage: persist cumulative stats beyond 20-entry rolling window
- Shared `src/utils.js`: deduplicate `buildMarkdown`/`buildFilename`/`buildJSON`/`buildZip` from popup.js and background.js (needs dynamic import or build step)
