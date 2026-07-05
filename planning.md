# Inkpour — Planning & Architecture Notes

Last updated: 2026-07-05 (Tasks 1–25 complete)

## What it is

A Firefox/Chrome WebExtension (MV3) that extracts AI chat conversations from supported pages and exports them as Markdown, PDF, HTML, or JSON. A floating in-page button provides one-click export without opening the popup.

---

## Shipped features

### Core export pipeline
- **MD** download — full Markdown with optional YAML front matter + TOC
- **PDF** — opens `print.html` in a new tab, triggers browser print dialog
- **HTML** download — self-contained standalone HTML file (dark/light mode)
- **JSON** download — structured `{ exporter, version, title, platform, messages[] }` schema
- **Copy MD** — copies Markdown to clipboard (Alt+Shift+C)
- **Copy HTML** — copies full standalone HTML to clipboard (Alt+Shift+H)

### Keyboard shortcuts
| Shortcut | Action |
|---|---|
| Alt+Shift+M | Export Markdown |
| Alt+Shift+C | Copy Markdown |
| Alt+Shift+H | Copy HTML |
| Alt+Shift+J | Export JSON |

### Right-click context menu
"Export with Inkpour" submenu → MD / Copy MD / JSON. Available on all pages; gracefully fails on unsupported ones.

### Markdown quality
- Bold (`**`), italic (`*`), strikethrough (`~~`), inline code (`` ` ``), code blocks (` ``` `)
- Headings h1–h6, unordered/ordered lists, nested lists
- Tables (GFM pipe format with `---` separators)
- Blockquotes, `<hr>` → `---`
- `<sup>/<sub>` → `^x^` / `~x~`
- `<details><summary>` → `> **Label**` blockquote (Claude thinking blocks)
- KaTeX `<span class="katex">` / MathJax `<mjx-container>` → `$…$` / `$$…$$`
- `<figure><figcaption>` → `![alt](src)\n*caption*`
- **Citation footnotes**: `<a href="..."><sup>N</sup></a>` or `<a>[N]</a>` → `[^N]` with `**Sources:**` section appended per message (Perplexity, academic)

### Filename templates
Tokens: `{platform}`, `{title}`, `{date}` (YYYY-MM-DD), `{time}` (HH-MM)
Default: `{platform}-{title}`

### Optional Markdown features (settings page)
- YAML front matter (title, platform, messages, words, date, url, exporter)
- Table of contents (for chats > 4 messages, with numbered headings for unique GFM anchors)

### Popup UX
- Platform chips (active highlighting when on a supported site)
- Message-count peek on open: "Ready · N messages · ~N words"
- Last-export hint: "Last: claude · 12 msgs · MD · 2h ago" (persisted in storage.local)
- Status classes: success (green) / error (red) / warning (amber, used for streaming guard)

### In-page floating button (Shadow DOM)
- Injected on all supported pages; isolated via `attachShadow({ mode: 'open' })`
- FAB (indigo circle, "ip") → expands menu: Export MD, Copy MD
- Dark-mode aware (CSS `prefers-color-scheme`)
- SPA navigation: `MutationObserver` reinjects button on URL change

### Streaming guard
Before any extraction, content script checks for visible stop-button elements per platform. Returns `{ error, streaming: true }` → popup shows amber warning instead of error.

### Auto-scroll (lazy loading)
On ChatGPT, Gemini, and AI Studio: scrolls to top before extraction, waits for DOM stability (≤4 s), then restores scroll position. JSDOM guard prevents errors in tests.

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
├── manifest.json           MV3, 15 host_permissions, 4 commands
├── src/content.js          Extraction + htmlToMarkdown + in-page button (~1000 lines)
├── popup.html / popup.js   6 export buttons + settings shortcut + last-export hint
├── background.js           Service worker: keyboard shortcuts + context menu
├── settings.html / .js     Options page
├── print.html / print.js   PDF print tab
├── icons/                  16/32/48/128px PNGs
└── test/
    ├── run-jsdom.js        JSDOM test harness (64 tests, 0 failures)
    └── fixtures/           15 HTML fixtures (one per platform)
```

### Key design decisions

**Single content script** (`src/content.js` IIFE): all extraction logic in one file — no module bundler needed, simpler for extension review. Trade-off: popup.js and background.js duplicate `buildMarkdown`/`buildFilename`/`buildJSON`. Acceptable for current scale.

**Shadow DOM for in-page button**: prevents host-page CSS leaking into the Inkpour UI. The shadow root has `mode: 'open'` (allows debugging), `all: initial` resets inherited styles.

**`window.__inkpourTestHostname`**: test escape hatch so `detectSite()` routes correctly in JSDOM/Playwright `about:blank` context. Zero impact on real browser runs.

**JSDOM test harness** (`test/run-jsdom.js`): Playwright can't install system deps in the sandbox. JSDOM runs all extraction tests without a real browser. `npm test` runs this. Playwright spec is kept for future full E2E runs.

**Citation footnotes**: module-level `_footnotes` array, reset per `htmlToMarkdown()` call. Same URL cited multiple times → same footnote number (indexOf dedup). Per-message footnote definitions; if two Perplexity responses both have `[^1]`, most renderers use the last definition (known limitation, acceptable for now).

**`<details>` handling**: children iterated directly (not via `convertNode(clone)`) to avoid infinite recursion since the clone would be a `<details>` element and hit the same case again.

---

## Known limitations / next steps

- Selectors for experimental platforms need verification against real live pages
- Promote experimental → full once selectors confirmed stable
- AI Studio extraction is fragile (edit-mode clicks may misfire on complex prompts)
- `buildMarkdown` / `buildFilename` / `buildJSON` duplicated across popup.js and background.js — candidate for a shared `src/utils.js` (needs a build step or dynamic import)
- In-page button only exports MD + Copy MD; PDF/JSON remain popup-only
- Context menu appears on all pages (MV3 limitation without exact `documentUrlPatterns`)
- Footnote `[^N]` numbers restart per-message — could conflict in multi-turn Perplexity exports
- Safari support possible via `xcrun safari-web-extension-converter` → Xcode → App Store

## Next ideas
- `{chat-url}` token in filename template
- NotebookLM source citation extraction (inline `[1]` refs to uploaded docs)
- Keyboard shortcut for PDF (Alt+Shift+P)
- Export history page (list of recent exports with re-download links)
- i18n: `_locales/en/messages.json` groundwork
- Kagi selector verification against real kagi.com/assistant
