# Privacy Policy — Inkpour

**Last updated: 2026-07-05**

## Summary

Inkpour is a browser extension that exports AI chat conversations to Markdown, PDF, HTML, JSON, or ZIP. It collects no personal data, sends nothing to any server, and requires no account.

## What Inkpour does

- Reads the DOM of AI chat pages you visit (ChatGPT, Claude, Gemini, Copilot, and others) when you click Export or use a keyboard shortcut.
- Converts that content to your chosen format and saves it directly to your device via the browser's native download API.
- Optionally uploads a Gist to GitHub if you configure a GitHub token and explicitly trigger the Upload to Gist action — the token is stored locally in your browser's extension storage and is never sent anywhere other than `api.github.com`.
- Optionally appends to a Notion page if you configure a Notion integration token + page ID and explicitly trigger the Notion export action — the token is stored locally and is never sent anywhere other than `api.notion.com`.
- Optionally writes exported files directly to a folder on your device (Chrome/Edge only) if you choose one via the "Direct-to-vault" setting — this uses the browser's File System Access API, stays entirely local, and involves no network request at all.
- Optionally calls a webhook URL of your choosing if you configure one in Settings — this is entirely opt-in and you control the endpoint.

## What Inkpour does not do

- Does not collect, transmit, or store any data on external servers.
- Does not track usage, analytics, or telemetry of any kind.
- Does not read pages outside the AI chat sites listed in its permissions.
- Does not access your browsing history.
- Does not use cookies.

## Data stored locally

Inkpour stores the following data in your browser's local extension storage (`chrome.storage.local` / `browser.storage.local`):

- Your export settings (format, filename template, webhook URL, GitHub token, Notion token/page ID).
- A local export history log (titles, timestamps, word counts) used for the in-extension history view.
- If you choose a direct-to-vault folder (Chrome/Edge only), a reference to that folder (a `FileSystemDirectoryHandle`) is kept in a separate local IndexedDB store so it doesn't need to be re-picked every time — this reference never leaves your device and grants no access beyond the one folder you explicitly chose.

This data never leaves your device unless you configure a GitHub token, Notion token, or webhook, in which case only the content you explicitly export is sent to those endpoints.

## Permissions explained

| Permission | Why |
|---|---|
| `activeTab` / `tabs` | Read the current chat page to extract conversation content |
| `storage` | Save your settings and local export history |
| `downloads` | Save exported files to your device |
| `clipboardWrite` | Copy Markdown or HTML to clipboard when requested |
| `contextMenus` | Add right-click Export and Upload to Gist menu items |
| Host permissions (AI chat sites) | Read conversation DOM on supported platforms |
| `api.github.com` | Upload to GitHub Gist (only when you trigger it) |
| `api.notion.com` | Append to a Notion page (only when you trigger it) |

## Contact

Inkpour is open source: [github.com/tronicum/inkpour](https://github.com/tronicum/inkpour)

For questions or concerns, open an issue on GitHub.
