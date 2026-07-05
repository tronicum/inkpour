# 🖋 Inkpour

[![Beta](https://img.shields.io/badge/status-beta-orange?style=flat-square)](https://github.com/tronicum/inkpour)
[![CI](https://img.shields.io/github/actions/workflow/status/tronicum/inkpour/ci.yml?branch=dev&style=flat-square&label=CI)](https://github.com/tronicum/inkpour/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL%20v3-blue?style=flat-square)](./LICENSE)
[![MV3](https://img.shields.io/badge/Manifest-V3-5b5bd6?style=flat-square)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json)
[![Tests](https://img.shields.io/badge/tests-64%20passed-16a34a?style=flat-square)](./test/run-jsdom.js)

**Export AI chat conversations to Markdown, PDF, HTML, or JSON — one click, no accounts, no servers.**

Inkpour is a lightweight WebExtension (Manifest V3) that works in Firefox, Chrome, Edge, and Brave. Everything happens locally in your browser.

---

## Supported platforms

| Platform | URL | Status |
|---|---|---|
| ChatGPT | chatgpt.com / chat.openai.com | ✅ Full |
| Claude | claude.ai | ✅ Full |
| Google Gemini | gemini.google.com | ✅ Full |
| Google AI Studio | aistudio.google.com | ✅ Full |
| Microsoft Copilot | copilot.microsoft.com / copilot.com | ✅ Full |
| Grok | grok.com | ✅ Full |
| Perplexity | perplexity.ai | 🧪 Experimental |
| DeepSeek | chat.deepseek.com | 🧪 Experimental |
| Meta AI | meta.ai | 🧪 Experimental |
| Mistral Le Chat | chat.mistral.ai | 🧪 Experimental |
| HuggingChat | huggingface.co/chat | 🧪 Experimental |
| Poe | poe.com | 🧪 Experimental |
| Phind | phind.com | 🧪 Experimental |
| NotebookLM | notebooklm.google.com | 🧪 Experimental |
| Kagi Assistant | kagi.com | 🧪 Experimental |

Experimental = selectors verified against fixture HTML; real-page accuracy needs ongoing maintenance as sites update their DOM.

---

## Features

### Export formats
- **Markdown** (`.md`) — clean GFM with optional YAML front matter and table of contents
- **PDF** — opens a clean, ad-free print-preview tab and triggers the browser print dialog
- **HTML** — fully self-contained single file with dark/light mode, no external dependencies
- **JSON** — structured `{ exporter, version, title, platform, exportedAt, messages[] }`

### Clipboard
- **Copy MD** (`Alt+Shift+C`) — Markdown to clipboard instantly
- **Copy HTML** (`Alt+Shift+H`) — full standalone HTML to clipboard (paste into Notion, Confluence, email)

### Keyboard shortcuts (no popup needed)
| Shortcut | Action |
|---|---|
| `Alt+Shift+M` | Export Markdown |
| `Alt+Shift+C` | Copy Markdown |
| `Alt+Shift+H` | Copy HTML |
| `Alt+Shift+J` | Export JSON |

### Right-click context menu
Right-click any supported page → **Export with Inkpour** → MD / Copy / JSON.

### Markdown quality
Faithfully converts the full rich-text DOM:
- Headings, bold, italic, strikethrough, inline code, fenced code blocks with language tags
- Tables (GFM pipe format), nested lists, blockquotes
- `<details>/<summary>` → collapsible blockquote (preserves Claude's extended thinking blocks)
- KaTeX / MathJax → `$…$` / `$$…$$` LaTeX math
- Citation superscripts (`<a><sup>1</sup></a>`) → `[^1]` footnotes with a **Sources:** section (Perplexity)
- Figure + figcaption → `![alt](src)\n*caption*`

### Filename templates
Tokens: `{platform}`, `{title}`, `{date}` (YYYY-MM-DD), `{time}` (HH-MM). Default: `{platform}-{title}`.

### UX details
- Platform chips in popup highlight the current site
- Message-count peek on open: "Ready · 12 messages · ~1,800 words"
- Last-export hint: "Last: claude · 12 msgs · MD · 2h ago"
- Streaming guard: warns if the AI is still generating instead of exporting an incomplete response
- Auto-scroll: triggers lazy-loading of older messages on ChatGPT, Gemini, and AI Studio before extraction
- In-page floating button (Shadow DOM, dark-mode aware) — export without opening the popup

### Settings
- Default format preference
- Filename template
- YAML front matter (title, platform, date, URL, word count)
- Table of contents for long chats

---

## Quick start (Firefox)

```bash
git clone https://github.com/tronicum/inkpour.git
```

1. Open **`about:debugging`** → **This Firefox** → **Load Temporary Add-on…**
2. Select **`manifest.json`** from the cloned folder
3. Open any supported AI chat, click the Inkpour icon

**Chrome / Edge / Brave:** `chrome://extensions` → **Developer mode** → **Load unpacked** → select the folder.

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
npm test          # Run 64 JSDOM-based extraction tests (no browser needed)
```

### Project structure

```
inkpour/
├── manifest.json          MV3 manifest (15 host_permissions, 4 commands)
├── popup.html / popup.js  Popup UI + export logic
├── background.js          Service worker: keyboard shortcuts + context menus
├── settings.html / .js    Options page
├── print.html / print.js  PDF print-preview tab
├── icons/                 16 / 32 / 48 / 128 px PNGs
├── src/
│   └── content.js         Extraction, htmlToMarkdown, in-page button (~1100 lines)
└── test/
    ├── run-jsdom.js        JSDOM test harness (64 tests)
    └── fixtures/           15 HTML fixtures — one per platform
```

See [planning.md](./planning.md) for architecture decisions and next steps.

---

## Standing on the shoulders of giants

### [Trifall/chat-export](https://github.com/Trifall/chat-export)
TypeScript WebExtension for ChatGPT, Claude, and Gemini. The AI Studio edit-mode extraction approach (opening the edit button to read raw `data-value`) came from here. Licensed **MIT**.

### [revivalstack/ai-chat-exporter](https://github.com/revivalstack/ai-chat-exporter)
Feature-rich Tampermonkey userscript covering ChatGPT, Claude, Copilot, Gemini, and Grok with YAML front matter, TOC, keyboard shortcuts, and selective export. Licensed **MIT**.

---

## License

AGPL-3.0. Portions derived from [chat-export by Trifall](https://github.com/Trifall/chat-export) (MIT) — original copyright retained in LICENSE.
