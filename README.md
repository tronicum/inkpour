# 🐟 Inkpour

[![Beta](https://img.shields.io/badge/status-beta-orange?style=flat-square)](https://github.com/tronicum/inkpour)
[![CI](https://img.shields.io/github/actions/workflow/status/tronicum/inkpour/ci.yml?branch=dev&style=flat-square&label=CI)](https://github.com/tronicum/inkpour/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL%20v3-blue?style=flat-square)](./LICENSE)
[![MV3](https://img.shields.io/badge/Manifest-V3-5b5bd6?style=flat-square)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json)

**Export your AI chat conversations to Markdown, PDF, and HTML — directly from your browser.**

Inkpour is a lightweight WebExtension (Manifest V3) that saves conversations from the AI tools you use every day into clean, portable documents. One click, no accounts, no servers — everything happens locally in your browser.

---

## Supported platforms

| Platform | URL |
|---|---|
| ChatGPT | chat.openai.com / chatgpt.com |
| Claude | claude.ai |
| Google Gemini | gemini.google.com |
| Google AI Studio | aistudio.google.com |
| Microsoft Copilot | copilot.microsoft.com |

---

## Features

- Export conversations to **Markdown** (`.md`), **PDF**, or self-contained **HTML**
- **Copy to clipboard** — one click or `Alt+Shift+C` to copy Markdown directly
- **Keyboard shortcuts** — `Alt+Shift+M` to export, `Alt+Shift+C` to copy (no popup needed)
- Preserves headings, bold, italic, inline code, fenced code blocks, tables, lists, and emojis
- PDF export opens a clean, ad-free print preview — no Google UI, no clutter
- HTML export is a single self-contained file, openable in any browser
- Dark and light mode throughout — popup, PDF preview, and HTML export all follow system preference
- Active platform chip highlights which site you're on when you open the popup
- No data leaves your machine — no accounts, no telemetry, no backend

---

## Try it now (Firefox, Chrome, Edge, Brave — no account needed)

You can load Inkpour as a temporary extension directly in Firefox in about 30 seconds.

### Step 1 — Get the files

```bash
git clone https://github.com/tronicum/inkpour.git
cd inkpour
```

Or download the ZIP from the green **Code** button on this page and unzip it.

### Step 2 — Load in your browser

**Firefox**
1. Go to **`about:debugging`** in the address bar
2. Click **This Firefox** → **Load Temporary Add-on…**
3. Select **`manifest.json`** from the cloned folder

> Temporary add-ons are removed on restart. Reload via `about:debugging` → **This Firefox** → **Reload**.

**Chrome / Edge / Brave**
1. Go to **`chrome://extensions`** (or `edge://extensions`)
2. Enable **Developer mode** (toggle, top right)
3. Click **Load unpacked** and select the cloned folder

> Chrome keeps unpacked extensions across restarts as long as Developer mode stays on.

### Step 3 — Export a chat

1. Open any supported AI chat page with a conversation loaded
2. Click the Inkpour icon in your toolbar
3. Choose **MD**, **PDF**, **HTML**, or **Copy**
   - **MD** and **HTML** download immediately to your Downloads folder
   - **PDF** opens a clean preview tab and triggers the print dialog — choose **Save to PDF**
   - **Copy** puts the Markdown on your clipboard instantly
4. Or skip the popup entirely with keyboard shortcuts: `Alt+Shift+M` (export MD) / `Alt+Shift+C` (copy)

### Troubleshooting

**"Navigate to a supported AI chat page…" error**
The content script wasn't injected. Refresh the chat tab after loading the extension, then try again.

**PDF tab shows "Loading conversation…"**
The extension wasn't fully reloaded. Go to `about:debugging` → Reload Inkpour, refresh the chat tab, then export again.

**No messages found**
Scroll through the full conversation so it's loaded in the DOM, then export.

---

## Project structure

```
inkpour/
├── manifest.json          ← MV3 extension manifest
├── popup.html             ← Toolbar popup UI
├── popup.js               ← Export trigger, download logic, MD/HTML/PDF builders
├── print.html             ← Clean print preview page (PDF flow)
├── print.js               ← Reads localStorage, renders, triggers window.print()
├── icons/
│   ├── icon-48.png
│   └── icon-96.png
└── src/
    ├── content.js         ← Injected into chat pages — extracts messages
    ├── extractors/        ← Per-site DOM scrapers (reference implementations)
    │   ├── chatgpt.js
    │   ├── claude.js
    │   ├── gemini.js
    │   ├── aistudio.js    ← Async edit-mode extraction (Trifall technique)
    │   ├── copilot.js
    │   └── index.js
    ├── exporters/         ← Output format logic
    │   ├── markdown.js    ← HTML → Markdown converter
    │   ├── pdf.js
    │   └── json.js
    └── browser/           ← Browser capability abstraction layer
        ├── index.js
        ├── firefox.js
        └── safari.js
```

---

## Roadmap

- [x] Markdown export
- [x] PDF export (clean print preview, ad-free)
- [x] HTML export (self-contained file)
- [x] Copy to clipboard (popup button + Alt+Shift+C)
- [x] Keyboard shortcuts (Alt+Shift+M export, Alt+Shift+C copy)
- [x] Platform chip highlighting in popup
- [x] Dark mode PDF preview and HTML export
- [ ] YAML front matter (title, date, platform, URL)
- [ ] Table of contents for long conversations
- [ ] In-page export button injected next to share button
- [ ] Improved AI Studio extraction (Trifall edit-mode approach)
- [ ] Gemini selector improvements
- [ ] Google Search AI mode support
- [ ] Safari / iOS support via Xcode Web Extension converter

---

## Standing on the shoulders of giants

Inkpour would not exist without the excellent open source work that came before it.

### [Trifall/chat-export](https://github.com/Trifall/chat-export)
A beautifully built TypeScript WebExtension that exports conversations from ChatGPT, Claude, and Gemini (AI Studio) to Markdown, XML, JSON, and HTML. The AI Studio edit-mode extraction approach is particularly clever — opening the edit button to read the raw `data-value` from the textarea rather than scraping rendered HTML. A reference implementation we deeply respect. Licensed **MIT**.

### [revivalstack/ai-chat-exporter](https://github.com/revivalstack/ai-chat-exporter)
A feature-rich Tampermonkey userscript by Mic Mejia supporting ChatGPT, Claude, Copilot, Gemini, and Grok, with YAML front matter, table of contents, keyboard shortcuts, and selective export. The most complete tool in this space, actively maintained. A real inspiration for where Inkpour is heading. Licensed **MIT**.

---

## License

Inkpour is released under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

Portions derived from [chat-export by Trifall](https://github.com/Trifall/chat-export) are used under the MIT License — the original copyright notice is retained in the LICENSE file.

See [LICENSE](./LICENSE) for full details.

---

## Contributing

Pull requests welcome. Open an issue first for anything non-trivial. See [planning.md](../planning.md) for the current direction.
