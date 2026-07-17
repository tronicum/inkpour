# Inkpour TODOs — scored backlog

Single consolidated backlog (merged from `planning.md`'s old Known limitations /
Next ideas + the 2026-07-17 competitive-research chat,
`planning/googlesearch-inkpour-chat.md`). Batches are sized so one AI session
can read the batch's files once and do the whole batch — pick a batch, not a
random item.

Complexity: **XS** single function, <30 min · **S** one file, well-understood,
<2 h · **M** 2–4 files or one new subsystem, a focused session · **L** touches
core extraction/build pipeline or new integration surface, multi-session ·
**XL** new packaging/distribution surface or genuinely uncertain scope.

## Batch 1 — Settings page UX (quick win; files: settings.html, settings.js)
Save button is below the fold — 4 sections / 17 fields before the single
`#saveBtn`; easy to change something and navigate away unsaved. The whole save
path is one self-contained click handler (settings.js:138–162) building one
`prefs` object → single `storage.local.set` — nothing blocks autosave.
- [ ] **S** Autosave: move the click-handler body into `save()`; call from a
  `change` listener on every field; debounce ~400–500 ms on `input` for text
  fields (filenameTemplate, subfolder, webhookUrl, gistTags, githubToken). Keep
  the `#saveStatus` toast; keep the button as redundant, not load-bearing.
- [ ] **XS** Sticky save bar: `.save-row { position: sticky; bottom: 0; }` +
  background/top border. Do alongside autosave — it becomes the toast's home.
- [ ] **S** (optional) Collapsible sections: `<details>` per `<section>`
  (4 sections, settings.html:193–392). Scannability only — doesn't fix
  "forgot to save" by itself; skip if session budget is tight.

## Batch 2 — Google AI Mode turn-duplication bug (dedicated session; src/content.js + new fixture)
- [ ] **M** Extractor duplicates every turn: each exchange appears twice (once
  bled into the tail of the previous Gemini message with page furniture like
  `Show allCopiedCopyEditYou said: ...`, once as its own proper turn). Front
  matter said "20 messages" — really 10 unique turns. Also leaks "Share public
  link" / feedback-widget / related-search blocks into bodies. Likely a
  boundary issue in `extractGoogleAiModeTurnsByGeometry()`
  (src/content.js:1258): the Y-position cut between answers isn't tight enough,
  or duplicate a11y nodes both pass `isVisibleForExtraction()`. M not S: single
  function, but needs live reproduction on google.com AI Mode + a captured
  fixture + dedup logic with judgment about which copy to keep.

## Batch 3 — Markdown quality (one session; src/content.js md-conversion + src/utils.js buildMarkdown + tests)
- [ ] **S** Footnote continuity: `_footnotes` array resets per message
  (content.js ~line 30–38), so `[^N]` numbers restart and collide in multi-turn
  Perplexity exports. Carry a running offset across messages (or namespace
  per-message). Fully covered by JSDOM tests.
- [ ] **S** Obsidian-flavor markdown toggle: Dataview-friendly front-matter keys
  (e.g. `type: ai-chat`) layered on the existing YAML/tags support in
  `buildMarkdown()`; maybe `[[wikilink]]`s. Mechanical — the YAML block and the
  settings-toggle pattern (gistTags etc.) both already exist.

## Batch 4 — Quick-win grab bag (short session; three small independent items)
- [ ] **S** Context menu on supported pages only: pass `documentUrlPatterns`
  built from `supported-sites.json` when creating the parent menu item
  (background.js, the `api.contextMenus.create({ id: 'inkpour-parent', ... })`
  block starting ~line 92).
- [ ] **S** Streaming/auto-scroll progress: popup already shows "Extracting…"
  (popup.js:349) — the gap is the shortcut/FAB path, which shows nothing while
  auto-scroll runs. Reuse the existing `showToast` action from content.js.
- [ ] **S** Lifetime stats: persist cumulative counters (exports, words,
  per-platform/format) at history-write time so stats survive the 20-entry
  rolling window; render in the history.html stats bar.

## Batch 5 — Notion export (dedicated session; background.js + settings.html/.js + popup.js)
- [ ] **M** BYO integration token + target page ID in settings, client-side
  `fetch` to the Notion API (`PATCH /v1/blocks/{page_id}/children` — verify
  against Notion's real docs; the research chat's endpoint was garbled). No
  backend. Follows the Gist shape exactly (`doGistUpload`, background.js:254–318:
  settings fields → build content → fetch → toast → open tab), so plumbing is
  well-trodden; the real work is a markdown→Notion-blocks converter and the
  100-blocks-per-request append limit. M for a v1 (paragraphs, headings, code,
  quotes, flat lists); full table/nested-list fidelity pushes it to L — ship v1
  first. Live testing needs Stefan's Notion token (flag: ask before session).

## Batch 6 — Direct-to-vault saving via File System Access API (dedicated session)
- [ ] **M** `showDirectoryPicker()` from popup/options, persist the directory
  handle (IndexedDB — handles don't survive in storage.local), re-request
  permission on reuse. Chrome-only: Firefox won't implement FSA, so
  feature-detect and fall back to the existing Downloads-subfolder setting.
  Supersedes the old "Obsidian vault path via Downloads API" idea (Downloads
  API can't write outside the Downloads folder — dead end).

## Batch 7 — New extraction surfaces (needs live logged-in pages — Stefan's browser; flag before starting)
- [ ] **L** ChatGPT Canvas export: non-linear side-panel UI, needs its own
  extraction rules + fixture. DOM unknown until inspected live.
- [ ] **L** Claude Artifacts: extract as structured blocks alongside the chat,
  not as plain code. Same caveat: live DOM inspection required first.
- [ ] **M** NotebookLM inline source citations (`[1]` refs to uploaded docs) —
  selectors verified reachable 2026-07, so this is testable; extend the
  existing `<chat-message>` extractor + citation-footnote pipeline.
- [ ] **M** AI Studio hardening: edit-mode clicks misfire on complex prompts;
  needs live sessions to reproduce, then defensive rewrite of the async
  edit-mode flow.
- [ ] **XS** Verify temporary/incognito chats export cleanly (should — the
  extraction is DOM-based). Pure test, no code expected; if it passes, it
  becomes a README claim (see Non-code).

## Batch 8 — Batch export (multi-session; design-first)
- [ ] **L** Pick multiple conversations from a platform's history sidebar → one
  ZIP. Everything today is single-active-tab (popup.js eager extraction;
  "Export All" at popup.js:764 is formats-not-conversations), so this needs a
  new orchestration layer: enumerate sidebar links, open/extract each
  conversation (sequential tab automation or background fetch where possible),
  aggregate through the existing `buildZip`. Start with ChatGPT + Claude only.
  Spend the first session on design + sidebar-enumeration spike, not code.

## Batch 9 — Distribution (XL; blocked on Stefan — accounts, fees, listing assets)
- [ ] **XL** Submit to Firefox Add-ons (AMO) + Chrome Web Store: developer
  accounts, listing copy/screenshots, review-policy pass (PRIVACY.md exists).
  Highest-leverage item in the whole backlog, but can't start without Stefan.
- [ ] **XL** Safari App Store: `xcrun safari-web-extension-converter`, open
  `safari/Inkpour-Safari/` in Xcode, sign with an Apple Developer account
  (paid) — scaffold already in `safari/`.

## Deferred (don't pick up without a trigger)
- [ ] **M** RTL layout pass for ar/fa locales — CSS assumes LTR everywhere.
  Wait for a usage signal from those locales.

## Non-code
Positioning (reference, not work items):
- Angle: free, open-source, local-first, BYO-API-key — directly undercuts
  YourAIScroll's paywalled Notion sync / batch export / PDF-DOCX ($4.49/mo).
- Competitors: YourAIScroll (multi-platform + KB sync), Pactify (ChatGPT-only),
  Tactiq (voice transcripts), SaveGPT/ChatGPT Exporter (single-site),
  Gumloop/n8n (API automation — existing webhook already covers that niche).
- Their "multi-site tools break when sites change UI" critique = keep the JSDOM
  fixture suite growing and selectors re-verified.

Stefan's action items (not code):
- [ ] README "Workflows: exporting to knowledge bases" section — Obsidian
  (drag-and-drop, or point Downloads-subfolder at the vault); Notion once
  Batch 5 ships; temp-chat support once Batch 7's verification passes.
- [ ] Decisions needed before their batches: Notion test token (Batch 5),
  logged-in browser time (Batch 7), store/dev accounts (Batch 9).
