# 🐟 Inkpour

**Export your AI chat conversations to Markdown, PDF, and more — directly from your browser.**

Inkpour is a lightweight Firefox WebExtension (Manifest V3) that lets you save conversations from the AI tools you use every day into clean, portable documents. One click, no accounts, no servers — everything happens locally in your browser.

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

- Export conversations to clean **Markdown** (`.md`)
- Preserves headings, bold, italic, code blocks, lists, and tables
- Dark and light mode popup UI
- No data leaves your machine
- No accounts, no telemetry, no backend

---

## Installation (local / development)

1. Clone this repo
2. Open Firefox and navigate to `about:debugging`
3. Click **This Firefox** → **Load Temporary Add-on**
4. Select `manifest.json` from the `inkpour/` folder
5. Open any supported chat page with a conversation loaded
6. Click the Inkpour icon in your toolbar and hit **Export**

---

## Project structure

```
inkpour/
├── manifest.json       ← MV3 extension manifest
├── popup.html          ← Toolbar popup UI
├── popup.js            ← Export trigger + download logic
├── src/
│   └── content.js      ← HTML → Markdown parser + site extractors
└── icons/
    ├── icon-48.png
    └── icon-96.png
```

---

## Roadmap

- [ ] PDF export
- [ ] YAML front matter + table of contents
- [ ] In-page export button (injected next to share button)
- [ ] Improved AI Studio extraction
- [ ] Gemini (gemini.google.com) selector improvements
- [ ] Safari / iOS support via Xcode Web Extension converter
- [ ] Keyboard shortcut (Alt+M)

---

## Standing on the shoulders of giants

Inkpour would not exist without the excellent open source work that came before it. A sincere thank you to:

### [Trifall/chat-export](https://github.com/Trifall/chat-export)
A beautifully built TypeScript WebExtension that exports conversations from ChatGPT, Claude, and Gemini (AI Studio) to Markdown, XML, JSON, and HTML. The AI Studio edit-mode extraction approach in particular is clever engineering — opening the edit button to read raw `data-value` from the textarea rather than scraping rendered HTML. Trifall's work is a reference implementation we deeply respect. Licensed under **MIT**.

### [revivalstack/ai-chat-exporter](https://github.com/revivalstack/ai-chat-exporter)
A feature-rich Tampermonkey userscript by Mic Mejia supporting ChatGPT, Claude, Copilot, Gemini, and Grok, with YAML front matter, table of contents, keyboard shortcuts, and selective export. The most complete tool in the space, actively maintained. A real inspiration for where Inkpour is heading. Licensed under **MIT**.

---

## License

Inkpour is released under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

Portions derived from [chat-export by Trifall](https://github.com/Trifall/chat-export) are used under the MIT License — the original copyright notice is retained in the LICENSE file.

See [LICENSE](./LICENSE) for full details.

---

## Contributing

Pull requests welcome. Open an issue first for anything non-trivial.
