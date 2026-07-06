# App Store Assets for Inkpour

This directory holds screenshots and copy for App Store Connect submission.

---

## Required Screenshots

App Store Connect rejects submissions that are missing mandatory device sizes.
Capture screenshots from the Simulator (use the device types listed below — the
resolutions must match exactly) or from physical devices.

### iOS

| Device | Simulator name | Canvas size | Required |
|--------|---------------|-------------|----------|
| 6.7" iPhone (Pro Max) | iPhone 15 Pro Max | **1290 × 2796 px** | Yes |
| 6.1" iPhone | iPhone 15 | 1179 × 2556 px | Optional (recommended) |
| 12.9" iPad Pro | iPad Pro (M2) 12.9" | **2048 × 2732 px** | Yes |

Minimum 1, recommended 3 screenshots per device size.

### macOS (if shipping Mac App Store variant)

| Size | Notes |
|------|-------|
| **2880 × 1800 px** | Required for macOS submissions |

---

## Suggested Screenshots — 3 per device

### Screenshot 1: Popup in action
Show the Inkpour popup open on a ChatGPT or Claude conversation with several messages visible.
The popup should display the message count, word count, and the row of export buttons.

Overlay text suggestion:
> **Export any AI chat in one tap**
> Markdown · DOCX · PDF · HTML · JSON

### Screenshot 2: History page
Show the export history page (`history.html`) with several past exports listed.
A pinned (starred) export should be visible at the top.

Overlay text suggestion:
> **Every export, always at hand**
> Re-download, copy, or star any past export

### Screenshot 3: DOCX export result
Show a Word document (opened in Pages or Microsoft Word) containing a formatted
AI conversation — indigo user message blocks, green AI response blocks, a code block,
and a table if possible.

Overlay text suggestion:
> **Rich Word documents, no server needed**
> Headings · tables · code blocks · task lists

---

## macOS Screenshot Guidance

Capture the Safari window with the Inkpour popup open (click the toolbar icon),
showing a full AI conversation behind it. Set Safari to a light appearance for
a clean, accessible look.

---

## App Store Description

Copy and paste this text into the **Description** field in App Store Connect.
The first paragraph is the most prominent — keep it punchy.

---

### Short Description (170 characters max, for search results)

Export ChatGPT, Claude, Gemini, and 15+ AI chats to Markdown, Word, PDF, HTML, or JSON — one tap, no accounts, no servers.

---

### Full Description

**Inkpour — Export AI Conversations**

Save your AI chats the way you want them. Inkpour adds an export button to
ChatGPT, Claude, Gemini, Google AI Studio, Copilot, Grok, Perplexity,
DeepSeek, Meta AI, Mistral, HuggingChat, Poe, Phind, NotebookLM, and more.

**Export formats**
• Markdown (.md) — clean GitHub-flavored Markdown with optional YAML front matter and table of contents
• Word (.docx) — rich formatted document with colored message blocks, tables, code blocks, and hyperlinks
• PDF — opens a clean print-preview and triggers the browser's print dialog
• HTML — fully self-contained file with dark/light mode, no external dependencies
• JSON — structured export for developers and automation pipelines
• ZIP — Markdown + every code block extracted as its own file

**Clipboard shortcuts**
• Copy Markdown — paste straight into Obsidian, Notion, Bear, or any editor
• Copy HTML — paste into Confluence, email, or anywhere that accepts rich text

**Export history**
Every export is logged. Filter by title or platform, re-download any previous
export, or star items to pin them permanently.

**Privacy first**
Inkpour makes no network requests and contacts no servers. Your conversations
stay on your device. If you optionally add a GitHub token, Gist uploads go
directly from your browser to GitHub — Inkpour never sees your token or content.

**Supports 18+ AI platforms**
ChatGPT · Claude · Google Gemini · Google AI Studio · Microsoft Copilot ·
Grok · Perplexity · DeepSeek · Meta AI · Mistral Le Chat · HuggingChat ·
Poe · Phind · NotebookLM · Groq Playground · Kagi · Venice.ai · Z.ai

**Open source**
Inkpour is open source (AGPL-3.0) — review the code at github.com/tronicum/inkpour.

---

### Keywords (100 characters max, comma-separated)

AI chat export,markdown,ChatGPT,Claude,Gemini,Copilot,DOCX,PDF,Obsidian,conversation

---

### What's New (for update release notes)

Version 0.2.3
• Added DOCX export with rich formatting (colored message blocks, tables, task lists, code blocks)
• ZIP export: Markdown + all code snippets as individual files
• Export history with search, star/pin, and re-download
• Selective export — pick only the turns you want
• In-page floating button for quick access without opening the popup
• GitHub Gist integration and webhook support
• 18 supported AI platforms

---

## Promotional Text (170 characters max, can be updated without a new review)

Export any AI conversation to Markdown, Word, PDF, or JSON — one tap. No accounts. No servers. Works with ChatGPT, Claude, Gemini, and 15+ more.

---

## App Review Notes (paste into App Store Connect "Notes for Reviewer" field)

Inkpour is a Safari Web Extension. To test it:

1. Launch the app — the main screen shows instructions to enable the extension.
2. Open Safari and navigate to https://chat.openai.com or https://claude.ai.
   (You can use a free account on either service, or review the extension popup
   on a page with pre-existing conversation content.)
3. Tap the Extensions button (or AA button) in the address bar, then tap Inkpour.
4. The extension popup appears with export buttons. Tap "MD" to export to Markdown.

The extension uses no APIs that require device permissions. The "downloads" permission
in the manifest is a browser extension API — it is not the iOS photo library or Files
access. Exported files are delivered via the browser's native file-save mechanism.

No login is required for core functionality. The optional GitHub Gist integration
requires the user to supply their own GitHub Personal Access Token in Settings.
