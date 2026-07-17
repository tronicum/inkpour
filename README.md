# 🖋 Inkpour

[![v0.4.2](https://img.shields.io/badge/version-0.4.2-5b5bd6?style=flat-square)](https://github.com/tronicum/inkpour)
[![CI](https://img.shields.io/github/actions/workflow/status/tronicum/inkpour/ci.yml?branch=dev&style=flat-square&label=CI)](https://github.com/tronicum/inkpour/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL%20v3-blue?style=flat-square)](./LICENSE)
[![MV3](https://img.shields.io/badge/Manifest-V3-5b5bd6?style=flat-square)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json)
[![Tests](https://img.shields.io/badge/tests-198%20passed-16a34a?style=flat-square)](./test/run-jsdom.js)

**Export AI chat conversations to Markdown, PDF, HTML, JSON, DOCX, or ZIP — one click, no accounts, no servers.**

Inkpour is a lightweight WebExtension (Manifest V3) that works in Firefox, Chrome, Edge, and Brave. Everything happens locally in your browser.

---

## Supported platforms

| Platform | URL | Status |
|---|---|---|
| ChatGPT | chatgpt.com / chat.openai.com | ✅ Full |
| Claude | claude.ai | ✅ Full |
| Google Gemini | gemini.google.com | ✅ Full |
| Google AI Studio | aistudio.google.com | ✅ Full |
| Google Search (AI Overview / AI Mode) | google.com/search | 🧪 Experimental |
| Microsoft Copilot | copilot.microsoft.com / copilot.com | ✅ Full |
| Grok | grok.com | ✅ Full |
| Groq Playground | console.groq.com/playground | 🧪 Experimental |
| Perplexity | perplexity.ai | 🧪 Experimental |
| DeepSeek | chat.deepseek.com | 🧪 Experimental |
| Meta AI | meta.ai / www.meta.ai | 🧪 Experimental |
| Mistral Le Chat | chat.mistral.ai | 🧪 Experimental |
| HuggingChat | huggingface.co/chat | 🧪 Experimental |
| Poe | poe.com | 🧪 Experimental |
| NotebookLM | notebooklm.google.com | 🧪 Experimental |
| Kagi Assistant | kagi.com | 🧪 Experimental |
| Z.ai (Zhipu GLM) | chat.z.ai | 🧪 Experimental |
| Venice.ai | venice.ai | 🧪 Experimental |
| Chatbot Arena (LMArena / Arena AI) | arena.ai / lmarena.ai / chat.lmsys.org | 🧪 Experimental |
| Character.AI | character.ai | 🧪 Experimental |
| Cohere Coral | coral.cohere.com | 🧪 Experimental |
| Pi.AI | pi.ai | 🧪 Experimental |

Experimental = selectors verified against fixture HTML; real-page accuracy needs ongoing maintenance as sites update their DOM.

---

## Features

### Export formats
- **Markdown** (`.md`) — clean GFM with optional YAML front matter and table of contents
- **Word** (`.docx`) — rich OOXML: colored message blocks (indigo/green), native tables, embedded hyperlinks, task-list checkboxes, code blocks with language labels, headings h1–h6, blockquotes (IntenseQuote style), attribution footer — pure-JS, no server, no dependency
- **PDF** — opens a clean, ad-free print-preview tab and triggers the browser print dialog
- **HTML** — fully self-contained single file with dark/light mode, no external dependencies
- **JSON** — structured `{ exporter, version, title, platform, exportedAt, messages[] }`
- **ZIP** — `chat.md` + every code block extracted as its own file (`snippet-1.py`, `snippet-2.js`, …)
- **Export All** — popup button that simultaneously saves MD + DOCX + ZIP in one click

### Clipboard
- **Copy MD** (`Alt+Shift+C`) — Markdown to clipboard instantly
- **Copy HTML** (`Alt+Shift+H`) — full standalone HTML to clipboard (paste into Notion, Confluence, email)

### Keyboard shortcuts (no popup needed)
| Shortcut | Action |
|---|---|
| `Alt+Shift+M` | Export Markdown |
| `Alt+Shift+C` | Copy Markdown |
| `Alt+Shift+P` | Export PDF |
| `Alt+Shift+D` | Export DOCX |
| `Alt+Shift+G` | Upload to GitHub Gist |

Copy HTML, JSON, and ZIP are available via the popup and right-click menu. Chrome caps extensions at 4 keyboard shortcuts; Firefox supports all five.

### Right-click context menu
Right-click any supported page → **Export with Inkpour** → MD / Copy / JSON / ZIP / Upload to Gist.

### Export history
Click **⏱ History** in the popup footer to see the last 20 exports. Filter by title, platform, or format with **fuzzy search** (character-by-character ordered match — type `cpdf` to find "claude pdf"), re-download, or copy any previous export. **Star** any export to pin it permanently — starred exports survive "Clear all" and are stored separately.

### Integrations
- **GitHub Gist** — add a Personal Access Token (gist scope) in Settings to unlock the "Gist ↑" popup button and `Alt+Shift+G` shortcut. Created Gists open in a new tab.
- **Webhook** — POST export metadata to any URL after each export (n8n, Zapier, Make.com, custom endpoints). Toggle "Include content" to send the full exported text.

### Markdown quality
Faithfully converts the full rich-text DOM:
- Headings, bold, italic, strikethrough, inline code, fenced code blocks with language tags
- Tables (GFM pipe format, numeric columns right-aligned automatically)
- Task lists (`- [x]` / `- [ ]`) with ☑/☐ rendering in HTML and DOCX
- Nested lists (arbitrary depth), blockquotes, `<hr>`
- `<details>/<summary>` → collapsible blockquote (preserves Claude's extended thinking blocks)
- KaTeX / MathJax → `$…$` / `$$…$$` LaTeX math
- Citation superscripts (`<a><sup>1</sup></a>`) → `[^1]` footnotes with a **Sources:** section (Perplexity)
- `<mark>` → **bold**, `<kbd>` → `code`, `<abbr title="…">` → word (definition)
- Figure + figcaption → `![alt](src)\n*caption*`
- Images: `data:` URIs noted as `[embedded image]`, ephemeral `blob:` URLs noted as `[blob image — not persistent]`

### Filename templates
Tokens: `{platform}`, `{title}`, `{date}` (YYYY-MM-DD), `{time}` (HH-MM), `{url}` (page hostname), `{words}` (approximate word count).
Default: `{platform}-{title}`.

### UX details
- Platform chips in popup highlight the current site
- Eager extraction on popup open — cached result reused for all buttons, no duplicate DOM crawl
- Click the status bar to re-extract (useful after AI finishes generating)
- Message-count peek on open: "Ready · 12 messages · 4u/8a · ~1,800 words · ~9 min read · 3 code blocks"
- Last-export hint: "Last: claude · 12 msgs · MD · 2h ago"
- Source URL included in markdown preamble (and in YAML front matter when enabled)
- Reading time estimate (`~N min read`) in the preamble and popup status bar; `reading_time_min` field in YAML front matter
- Personal notes field (click "+ Add notes"): free-text annotation prepended as a Markdown blockquote in MD/copy/Gist exports, included as a `notes` field in JSON
- Selective export: click "☑ Select messages" to open a scrollable checkbox list — export only the turns you want. Quick-select buttons: All, None, User only, AI only
- Streaming guard: warns if the AI is still generating instead of exporting an incomplete response
- Auto-scroll: triggers lazy-loading of older messages on ChatGPT, Gemini, and AI Studio before extraction
- In-page floating button (Shadow DOM, dark-mode aware) — MD / Copy MD / HTML / DOCX / PDF / ZIP without opening the popup (`Alt+Shift+D` exports DOCX directly)
- In-page toast notifications for keyboard shortcut feedback

### Settings
- Default format preference (MD / PDF / HTML / JSON / ZIP)
- Filename template with `{url}`, `{words}` support
- YAML front matter (title, platform, date, source_url, word count)
- Obsidian tags in YAML front matter (`tags: [ai-chat, {platform}]`)
- Table of contents for long chats
- Downloads subfolder (downloads into a named subdirectory)
- GitHub token + Gist visibility (secret / public)
- Webhook URL + include-content toggle

---

## Supported browsers

| Browser | Load unpacked |
|---|---|
| Firefox | `about:debugging` → This Firefox → Load Temporary Add-on… → select `manifest.json` |
| Chrome | `chrome://extensions` → Developer mode → Load unpacked → select folder |
| Edge | `edge://extensions` → Developer mode → Load unpacked → select folder |
| Brave | `brave://extensions` → Developer mode → Load unpacked → select folder |
| Safari | Planned, not yet published — see below |

**Safari App Store**: a build scaffold exists ([`safari/XCODE_GUIDE.md`](./safari/XCODE_GUIDE.md)), but it's not currently maintained toward a store release — packaging through Xcode and keeping it current isn't worth doing speculatively. If you'd use it, [open or 👍 an issue tagged `safari`](https://github.com/tronicum/inkpour/issues?q=is%3Aissue+label%3Asafari) so real demand can decide when this gets picked up.

## Quick start

```bash
git clone https://github.com/tronicum/inkpour.git
```

Then follow the row for your browser above.

### Troubleshooting

| Symptom | Fix |
|---|---|
| "Content script not running" error | Refresh the chat tab after loading the extension |
| PDF tab shows "Loading…" | Reload the extension in `about:debugging`, refresh chat tab |
| No messages found | Scroll through the full conversation to trigger lazy-loading |
| Streaming warning | Wait for the AI to finish generating, then export |

---

## Development

```bash
npm test          # Run 159 JSDOM-based extraction and builder tests (no browser needed)
```

### Project structure

```
inkpour/
├── manifest.json           MV3 manifest (28 host_permissions, 8 commands)
├── popup.html / popup.js   Popup UI: MD/PDF/HTML/JSON/ZIP/DOCX + Export All + Copy MD/HTML + Gist
├── background.js           Service worker: keyboard shortcuts + context menus + webhook
├── settings.html / .js     Options page (format, filename, YAML, TOC, subfolder, Gist, webhook)
├── print.html / print.js   PDF print-preview tab
├── history.html / .js      Export history with fuzzy search, re-download, star/pin
├── safari/                 Safari Web Extension build guide + scaffold
├── icons/                  16 / 32 / 48 / 128 px PNGs
├── src/
│   ├── content.js          Extraction, htmlToMarkdown, in-page button, toasts
│   └── utils.js            Shared builders: buildMarkdown, buildDocx, buildFilename, buildZip, …
└── test/
    ├── run-jsdom.js         JSDOM test harness (189 tests, 0 failures)
    └── fixtures/            19 HTML fixtures — one per platform
```

See [planning.md](./planning/planning.md) for architecture decisions and next steps.

---

## Standing on the shoulders of giants

### [Trifall/chat-export](https://github.com/Trifall/chat-export)
TypeScript WebExtension for ChatGPT, Claude, and Gemini. The AI Studio edit-mode extraction approach (opening the edit button to read raw `data-value`) came from here. Licensed **MIT**.

### [revivalstack/ai-chat-exporter](https://github.com/revivalstack/ai-chat-exporter)
Feature-rich Tampermonkey userscript covering ChatGPT, Claude, Copilot, Gemini, and Grok with YAML front matter, TOC, keyboard shortcuts, and selective export. Licensed **MIT**.

---

## Privacy

Inkpour collects no data and makes no external requests unless you explicitly configure a GitHub token or webhook. See [PRIVACY.md](./PRIVACY.md) for full details.

## License

AGPL-3.0. Portions derived from [chat-export by Trifall](https://github.com/Trifall/chat-export) (MIT) — original copyright retained in LICENSE.
