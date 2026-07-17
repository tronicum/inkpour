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
- [x] **S** Autosave: move the click-handler body into `save()`; call from a
  `change` listener on every field; debounce ~400–500 ms on `input` for text
  fields (filenameTemplate, subfolder, webhookUrl, gistTags, githubToken). Keep
  the `#saveStatus` toast; keep the button as redundant, not load-bearing.
  Done — verified with a JSDOM smoke test (discrete fields save on `change`,
  text fields debounce, Save button flushes a pending debounce immediately).
- [x] **XS** Sticky save bar: `.save-row { position: sticky; bottom: 0; }` +
  background/top border. Do alongside autosave — it becomes the toast's home.
- [ ] **S** (optional) Collapsible sections: `<details>` per `<section>`
  (4 sections, settings.html:193–392). Scannability only — doesn't fix
  "forgot to save" by itself; skip if session budget is tight.

## Batch 2 — Google AI Mode turn-duplication bug (dedicated session; src/content.js + new fixture)
- [x] **M** Extractor duplicates every turn: each exchange appears twice (once
  bled into the tail of the previous Gemini message with page furniture like
  `Show allCopiedCopyEditYou said: ...`, once as its own proper turn). Front
  matter said "20 messages" — really 10 unique turns. Also leaks "Share public
  link" / feedback-widget / related-search blocks into bodies. Likely a
  boundary issue in `extractGoogleAiModeTurnsByGeometry()`
  (src/content.js:1258): the Y-position cut between answers isn't tight enough,
  or duplicate a11y nodes both pass `isVisibleForExtraction()`. M not S: single
  function, but needs live reproduction on google.com AI Mode + a captured
  fixture + dedup logic with judgment about which copy to keep.
  Done — root-caused live via Chrome: the old code only checked each
  candidate element's top position, never its bottom, so a coarse-grained
  wrapper whose top happened to sit just inside a turn's band but whose
  bottom spilled hundreds/thousands of pixels past it got cloned whole,
  dragging in the next turn's heading + answer + "CopiedCopyEdit" chrome.
  Fixed with three checks: reject candidates whose bottom exceeds the turn
  boundary (forces the walk to drill into smaller children instead), exclude
  fragments of ANY turn heading (not just the current one), and exclude
  anything containing/contained-by the page's actual input controls (the
  follow-up textarea is always opacity:0 on this page — a styled decoy draws
  the visible placeholder — so its wrapping toolbar wasn't being excluded by
  visibility alone). Added a disclaimer-text cutoff as a safety net for the
  last turn specifically (no next heading to bound it), which also closes
  most of the "Share public link"/related-search leak. Verified live against
  a real 2-turn AI Mode conversation (google.com/search?...&udm=50) with the
  exact literal function copied from the file, then added a JSDOM regression
  fixture (`test/fixtures/google-ai-mode-geometry.html` — real getBoundingClientRect
  is mocked per-element-id since JSDOM has no layout engine) with 5 leak
  assertions; confirmed 4 of them fail against the pre-fix code and all pass
  after. Known residual: a small icon-button label inside the follow-up
  toolbar can still leak a few words if it's a *sibling* of the real
  textarea rather than an ancestor — the input-containment check only
  excludes ancestors/descendants of the actual control, not neighbor icon
  buttons that don't share a stable class name. Minor (a handful of words of
  UI-label text, not a duplicated turn); revisit only if it turns out to
  recur often.

## Batch 3 — Markdown quality (one session; src/content.js md-conversion + src/utils.js buildMarkdown + tests)
- [x] **S** Footnote continuity: `_footnotes` array resets per message
  (content.js ~line 30–38), so `[^N]` numbers restart and collide in multi-turn
  Perplexity exports. Carry a running offset across messages (or namespace
  per-message). Fully covered by JSDOM tests.
  Done — added a module-level `_footnoteOffset` that persists across every
  `htmlToMarkdown()` call within one extraction pass (reset once in
  `extractMessages()`), so both the inline `[^N]` references and the trailing
  `[^N]: url` definitions stay unique document-wide instead of every message
  restarting at 1. Added a dedicated regression test (two synthetic messages,
  each with their own citation) confirmed to fail against the pre-fix code
  and pass after.
- [x] **S** Obsidian-flavor markdown toggle: Dataview-friendly front-matter keys
  (e.g. `type: ai-chat`) layered on the existing YAML/tags support in
  `buildMarkdown()`; maybe `[[wikilink]]`s. Mechanical — the YAML block and the
  settings-toggle pattern (gistTags etc.) both already exist.
  Done, simplified — `type: ai-chat` is now always included whenever YAML
  front matter is on, no separate settings toggle. Rationale: it's a single
  harmless line useful to any Obsidian/Dataview user and not worth a new
  per-locale settings string across all 26 shipped locales (the i18n
  consistency test requires every locale file to have the exact same key
  set, so a new toggle would've meant translating strings for all of them).
  Skipped `[[wikilink]]`s — no clear, non-speculative target to link to.

## Batch 4 — Quick-win grab bag (short session; three small independent items)
- [x] **S** Context menu on supported pages only: pass `documentUrlPatterns`
  built from `supported-sites.json` when creating the parent menu item
  (background.js, the `api.contextMenus.create({ id: 'inkpour-parent', ... })`
  block starting ~line 92).
  Done, simplified — reused `api.runtime.getManifest().content_scripts[0].matches`
  directly instead of `supported-sites.json` (which turned out to be stale:
  still listed `phind.com`, missing `www.meta.ai`/`arena.ai` — same drift found
  in `SUPPORTED_HOSTS` below, fixed both while in there). Reading the manifest
  at runtime means this can't drift out of sync again — one source of truth
  instead of a second list to maintain. Only the parent menu item needs
  `documentUrlPatterns`; children are only reachable through its submenu.
- [x] **S** Streaming/auto-scroll progress: popup already shows "Extracting…"
  (popup.js:349) — the gap is the shortcut/FAB path, which shows nothing while
  auto-scroll runs. Reuse the existing `showToast` action from content.js.
  Done — all three non-popup export triggers (in-page FAB, right-click menu,
  keyboard shortcut) go through background.js sending `{action:'extract'}`
  directly to the content script with zero UI feedback; added a
  fire-and-forget `{action:'showToast', text: ...}` message right before each,
  reusing the existing `popupStatusExtracting` i18n string (already "Extracting…"
  in all 26 locales, so no new translation work needed).
- [x] **S** Lifetime stats: persist cumulative counters (exports, words,
  per-platform/format) at history-write time so stats survive the 20-entry
  rolling window; render in the history.html stats bar.
  Already done — this was fully shipped in an earlier session and just never
  got crossed off: `popup.js` `saveLastExport()` already accumulates
  `inkpour_lifetime_stats` (exports + words) on every export, and
  `history.js`'s `renderLifetimeStats()` already reads and displays it in the
  footer, wired up and i18n'd across all locales (`historyLifetimeStatsOne`/
  `historyLifetimeStatsOther`). No code changed for this item.

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
- [x] **M → investigated, not implemented** NotebookLM inline source citations —
  investigated live 2026-07 against a real 54-source notebook. `extractCitations()`
  already pulls the correct citation numbers from `button.citation-marker`
  elements (192 found on a real page); the gap was resolving number → actual
  source name. Checked every static-DOM angle first: `aria-label`, `title`,
  `dialoglabel`, `triggerdescription`, `aria-describedby` target, and `jslog`
  all carry generic/no source-identifying data. Tested the hypothesis that
  citation numbers map 1:1 to the left-sidebar "Quellen" list's DOM order
  (`.source-title`, 54 items) — falsified: clicking citation marker "1" opened
  a source titled "README.md" that isn't even in that 54-item list (which is
  entirely different, unrelated content). So citation numbers reference some
  internal NotebookLM index, not the visible sidebar order — no static mapping
  exists. The only way to resolve a name is to click the marker open, which
  (a) requires one click+wait per unique citation (up to 192 on a large
  notebook), (b) visibly changes the left sidebar/source-viewer panel the user
  currently has open — a real side effect for what should be a read-only
  export — and (c) is timing-dependent (real Angular CDK overlay, not
  synchronous). Given the cost/disruption, decided against implementing
  click-through resolution. Current bare `[N]` output is left as-is: it's
  honest (matches the number the user sees in NotebookLM's own UI) and
  non-disruptive. Not pursuing further unless a cheaper resolution path turns up.
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
- [x] **XL** Submit to Firefox Add-ons (AMO) + Chrome Web Store — in progress,
  Stefan is doing this directly (developer accounts, listing copy/screenshots,
  review-policy pass; PRIVACY.md already exists).

## Batch 10 — Automated store publishing (M–XL; blocked on Batch 9 landing first + Stefan gathering secrets)
Reference: [Trifall/chat-export's release.yml](https://github.com/Trifall/chat-export/blob/main/.github/workflows/release.yml)
(MIT — already an attributed inspiration in README's "Standing on the shoulders
of giants"). Confirmed by reading the actual workflow: it's `on: workflow_dispatch`
only (a manual "Run workflow" button in the Actions tab) — NOT triggered
automatically by push or tag, so it wouldn't replace Inkpour's existing
tag-triggered `release.yml`, it'd add two new jobs that run *after* a release is
cut. It also auto-versions daily via `fregante/daily-version-action` — that's a
different philosophy than Inkpour's current manual-bump-then-tag flow (which
Stefan controls deliberately); don't copy that part, just the two upload jobs,
triggered off the existing tag-driven release instead of on a schedule.

Both store CLIs need one-time credentials that only exist once the extension
is *first* submitted manually — this is why it's blocked on Batch 9 actually
landing, not just started:

- [ ] **M** Firefox (AMO) auto-submit: `npx web-ext sign --use-submission-api
  --channel listed`, needs `WEB_EXT_API_KEY` + `WEB_EXT_API_SECRET` as GitHub
  Actions secrets. Get these from addons.mozilla.org → Developer Hub → Manage
  API Keys (one-time, needs an existing AMO developer account — Batch 9). This
  is the smaller lift: one CLI call, two secrets, no external OAuth dance.
- [ ] **L** Chrome Web Store auto-submit: `npx chrome-webstore-upload-cli
  upload --auto-publish`, needs `EXTENSION_ID` + `CLIENT_ID` + `CLIENT_SECRET`
  + `REFRESH_TOKEN`. Bigger lift than Firefox: requires a Google Cloud project,
  enabling the Chrome Web Store API, creating an OAuth 2.0 client, and running
  a one-time authorization flow to mint the refresh token (Google's
  chrome-webstore-upload docs walk through this) — more setup surface, more
  places for Stefan to get stuck gathering credentials, and an OAuth refresh
  token can expire/get revoked, so this needs a documented re-mint procedure
  too, not just a one-time setup note.
- [ ] **S** Wire both into a new job in `.github/workflows/release.yml` (or a
  separate `publish.yml` triggered by the same tag push), gated behind GitHub
  [Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
  (`Firefox` / `Chrome`) the way the reference workflow does — lets each store's
  secrets be scoped separately and optionally gated behind a manual approval
  step before publishing goes live, which is worth keeping given "auto-publish"
  is otherwise irreversible.
- [ ] **XS** First real run needs to be watched live and treated as a dry run
  even though the CLIs don't offer one — can't fully verify secrets/permissions
  are right without actually attempting a submission.

## Deferred (don't pick up without a trigger)
- [ ] **XL** Safari App Store: `xcrun safari-web-extension-converter`, open
  `safari/Inkpour-Safari/` in Xcode, sign with an Apple Developer account
  (paid) — scaffold already in `safari/`. Deferred: Xcode maintenance overhead
  isn't worth it speculatively. Tracked at
  [github.com/tronicum/inkpour/issues/3](https://github.com/tronicum/inkpour/issues/3)
  (linked from the README) — pick up only once that issue shows real demand.
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
