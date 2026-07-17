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
- [x] **M → implemented, pending live test** BYO integration token + target
  page ID in settings, client-side `fetch` to the Notion API. Verified live
  against Notion's real docs this session (developers.notion.com/reference/
  patch-block-children + .../reference/block, 2026-07) — the endpoint is
  `PATCH https://api.notion.com/v1/blocks/{block_id}/children` with headers
  `Authorization: Bearer <token>` + `Notion-Version: 2026-03-11`, body
  `{ children: [...] }`, capped at 100 block objects per request (confirmed:
  "There is a limit of 100 block children that can be appended by a single
  API request"). Block shapes for paragraph/heading_1-3/code (language
  enum, confirmed values include "plain text" with a literal space)/quote/
  bulleted_list_item/numbered_list_item all confirmed against the live docs.
  Followed the popup.js `gistBtn` shape (popup.js:872–930) rather than
  background.js's `doGistUpload`, per the batch note's own primary
  recommendation: new `notionBtn` in popup.html/popup.js builds markdown →
  scrubs secrets via `redactSecrets()` (added `src/redact.js` to popup.html's
  script tags, which it wasn't loading before) → PATCHes in ≤100-block
  batches → opens the page (URL built from the configured page ID — Notion's
  append response has no `html_url` equivalent) → toast, mirroring
  `saveLastExport()` conventions (added a `'notion'` format alongside
  `'gist'` in history.js/history.html for parity). `markdownToNotionBlocks()`
  + `batchNotionBlocks()` added as pure functions in src/utils.js — v1 scope
  exactly as sized: paragraphs, heading_1/2/3 (h4-h6 clamp down), fenced code
  with language-alias mapping, blockquotes, flat (non-nested) bulleted/
  numbered lists, plus "---" → divider and YAML front matter → a single
  preserved `yaml` code block. Known v1 limitations (by design, matching the
  original scope note): nested lists flatten to top-level items, tables are
  not attempted, and inline formatting (**bold**, links, etc.) is kept as
  literal markdown text rather than converted to Notion rich-text
  annotations — full fidelity there was explicitly out of scope for v1.
  Settings gained `notionToken` (password field, same plaintext-storage
  fineprint as the GitHub token field, plus a note that the token must be
  connected to the target page via Notion's page ••• → Connections menu or
  every upload 404s) and `notionPageId`, both free-text/debounced-autosave
  per settings.js's existing pattern; background.js needed no changes since
  Notion, unlike Gist, doesn't have a background.js/context-menu path — only
  the popup button. 16 new JSDOM tests added (paragraphs, each heading
  level, code+language incl. alias mapping and fallback, quotes, flat
  ordered/unordered lists, dividers, YAML front matter, a full
  buildMarkdown() round-trip, and the ≤100-block batching logic including
  exact-100/250-split/empty/custom-size cases) — full suite 243→259 passed,
  0 failed, before and after. All 26 locale files updated with real
  (non-English-stub) translations for the 14 new i18n keys, verified with
  identical key sets across all locales. **Not yet verified**: the actual
  `fetch()` PATCH call end-to-end against a real Notion workspace — no live
  integration token was available in this sandbox. Needs Stefan's real
  Notion token before this can be marked fully done (flagged, as
  anticipated by the original note).

## Batch 6 — Direct-to-vault saving via File System Access API (dedicated session)
- [x] **M → implemented, pending live click-through test** `showDirectoryPicker()`
  from Settings (settings.html/.js — the "page context, real user gesture"
  location the original note called for; content scripts on arbitrary
  third-party chat pages never touch this), persisting the
  `FileSystemDirectoryHandle` via a new dedicated IndexedDB helper
  (`src/vaultHandle.js`, database `inkpour-vault`), with a synchronous
  `queryPermission`/`requestPermission({mode:'readwrite'})` re-request right
  at the top of every write-triggering click handler — before any other
  `await` — so it never gets stranded outside the click's transient user
  activation. Chrome-only, as scoped: feature-detected once via
  `'showDirectoryPicker' in window`; when false (Firefox/Safari) the entire
  new Settings section is `hidden` (not just disabled), so those browsers see
  and get exactly the same Export section as before this feature existed —
  the existing `obsidianVault` free-text Downloads-subfolder field is
  untouched and still the only option there, additive not replaced.
  Settings gained a "Direct-to-vault (Chrome only)" section: a "Choose vault
  folder…" button (requests `mode:'readwrite'` up front so there's nothing
  left to request right after picking), a folder-name display, a "Forget
  folder" button (`clearVaultHandle()`), and a "Write exports directly to
  this folder" checkbox that stays hidden until a folder has actually been
  chosen — mirrors every other setting's autosave-on-`change` pattern, plus a
  new `writeToVault` field in settings.js's `DEFAULTS`/load/`save()` (all
  three, same as every other persisted setting). popup.js's `mdBtn`, `docxBtn`,
  and `zipBtn` handlers (chose these three — direct file-producing buttons —
  over `jsonBtn`/`htmlBtn`, out of scope for v1) each resolve the vault handle
  and re-check its permission as literally the first thing in the click
  handler via a shared `resolveVaultHandleForWrite()`, before `extractFromPage()`
  (a message round-trip to the content script) can consume the gesture; when
  a handle is granted, `getFileHandle(name,{create:true})` →
  `createWritable()` → `.write()` → `.close()` (`writeFileToVault()` in
  `src/vaultHandle.js`) runs *instead of* the existing
  Blob-URL-download/`chrome.downloads.download()` path for that button, never
  both — on any failure (denied permission, missing/stale handle, quota,
  whatever) a distinct toast (`popupVaultWriteFailed`/`popupVaultPermissionDenied`)
  is shown and the handler returns immediately, deliberately not falling
  through to a Downloads write the user wasn't told about. 14 new i18n keys
  (8 settings-page strings, 3 popup status/error strings, 1 section header,
  plus 2 with `$1` placeholders) added with real (non-English-stub)
  translations to all 26 locale files, verified with identical key sets
  across all of them. 8 new JSDOM tests added for `src/vaultHandle.js`: the
  IndexedDB round-trip (get/set/clear, overwrite-on-reuse) via the
  `fake-indexeddb` dev dependency (added — JSDOM has no real IndexedDB at
  all), and the permission-decision logic factored out as pure/duck-typed
  functions (`shouldRequestPermission()`, `ensureReadWritePermission()`) so
  they're testable without a real `FileSystemHandle` object — full suite
  259→267 passed, 0 failed, before and after. **Known hard limit, not
  skipped out of laziness**: `showDirectoryPicker()` and real
  `FileSystemDirectoryHandle`/`FileSystemFileHandle` objects do not exist in
  JSDOM/Node and cannot be meaningfully polyfilled, so the actual
  `writeFileToVault()` call chain and the real native folder-picker dialog
  are NOT exercised by any automated test here — only a human clicking
  through Chrome for real (pick a folder, toggle the checkbox, export MD/DOCX/
  ZIP, restart the browser and confirm the permission-reprompt path, deny
  permission and confirm the error toast) can verify that end-to-end. Needs
  that live click-through before this is marked fully done. Did not touch
  Gist/webhook code, and specifically did not touch any Notion-related lines
  in settings.html/settings.js/popup.js (verified via `git diff` — the batch
  landed immediately before this one on `main`).

## Batch 7 — New extraction surfaces (needs live logged-in pages — Stefan's browser; flag before starting)
- [x] **L → smaller than scoped, fixed** ChatGPT Canvas export — investigated
  live 2026-07 against a real logged-in ChatGPT account, both Canvas variants:
  - **Code canvas** (asked ChatGPT to "open canvas and write a python script"):
    turned out NOT to need the non-linear side-panel handling the original
    note assumed. The code renders via a CodeMirror editor (`.cm-editor`/
    `.cm-content`) nested inside the SAME `<pre>` that's already a normal
    direct child of the turn's `.markdown` div — no separate panel, no new
    turn-enumeration logic needed. The existing `case 'pre':` handler in
    `convertNode()` already extracts CLEAN code (its `querySelector('code')`
    happens to reach straight through the CodeMirror markup), so there was no
    "PythonRun" toolbar-text leakage as initially suspected from a raw
    `textContent` check — that was a red herring from comparing the wrong
    thing (plain DOM `textContent` vs. what `htmlToMarkdown()` actually
    produces). The one real, confirmed gap: none of the three existing
    language-detection heuristics (class, sibling span, hljs) find anything
    for Canvas blocks, because the language name ("Python") sits as plain text
    in a `.sticky` toolbar header alongside Copy/Run `<button>`s inside the
    same `<pre>` — so every Canvas code export shipped with no language tag on
    the fence. Fixed with a 4th heuristic, scoped to only fire when a
    CodeMirror editor is actually present (`.cm-editor`/`.cm-content`/
    `#code-block-viewer`) so it can't misfire on some other platform's
    unrelated `.sticky` element: find the toolbar's non-button text label and
    use it as the language. 4 new JSDOM tests added (language tag applied,
    code stays clean, existing language-class path unaffected, false-positive
    guard for an unrelated `.sticky` pre with no CodeMirror editor) — all 4
    confirmed to fail pre-fix (missing language tag) and pass post-fix; full
    suite 267→271 passed, 0 failed, before and after.
  - **Text/document canvas** (asked ChatGPT to "open a text canvas document
    and write a note about coffee"): could NOT be verified — on this Free-plan
    account, the model's canvas tool call itself misfired and leaked as raw
    JSON text directly into the chat bubble (`{"name":"...","type":"document",
    "content":"..."}`) instead of opening a real canvas UI. This looks like a
    ChatGPT-side degradation (possibly free-tier/model-specific), not
    something to build extraction around — a real text-canvas document was
    never actually observed. Needs a retry (ideally on a paid plan) before
    concluding anything about that variant's DOM.
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
- [x] **XS** Verify temporary/incognito chats export cleanly — confirmed live
  2026-07 on ChatGPT's Temporary Chat (`chatgpt.com/?temporary-chat=true`):
  `[data-message-author-role]` finds both turns with correct roles and full
  text, identical to a normal chat's DOM, and `location.hostname` still
  resolves to `chatgpt.com` so `detectSite()` routes normally. No code needed.
  Passed — see README claim added under Non-code below.

## Batch 8 — Batch export (multi-session; design-first)
- [ ] **L** Pick multiple conversations from a platform's history sidebar → one
  ZIP. Everything today is single-active-tab (popup.js eager extraction;
  "Export All" at popup.js:764 is formats-not-conversations), so this needs a
  new orchestration layer. Start with ChatGPT + Claude only.

  **Goal, precisely stated:** this is retroactive — you open a platform's own
  history sidebar, tick several *past* conversations there, and get one ZIP.
  It is not about exporting multiple currently-open tabs.

  **Critical constraint (must not regress):** a history sidebar with multiple
  past conversations only exists when logged in. Inkpour's core function —
  exporting the one conversation on screen right now — works fine logged out
  (verified live for ChatGPT's Temporary Chat, Batch 7 XS above). Batch export
  must be a strictly additive layer on top of that: if there's no history
  sidebar / the platform looks logged out, the batch-export entry point simply
  doesn't appear (or no-ops) — it must never gate, wrap, or otherwise risk
  breaking the existing single-conversation extraction path, which has to keep
  working identically whether or not the user is logged in.

  **Chosen mechanism: sequential background tab automation** (over same-tab
  navigation, which would hijack the user's active tab for the whole run and
  can't be interrupted or later parallelized). Tradeoff accepted: hidden tabs
  will briefly flash open/close in the tab bar.

  **Orchestration sketch (background.js, new):**
  1. Entry point (new popup.js section, following the existing "Export All"
     checkbox-list convention at popup.js:764) reads the *current* tab's
     history sidebar via a new content-script message that returns
     `{title, url}` pairs — this is also the natural logged-in feature-detect
     point: if the sidebar query finds nothing, don't show the entry point.
  2. User ticks N conversations from that list.
  3. On "Start batch export", background.js iterates the selected URLs
     **sequentially** (not parallel — avoids overwhelming per-platform
     lazy-load/scroll behavior and looks less bot-like than bursty parallel
     tab creation):
     a. `chrome.tabs.create({url, active:false})`
     b. wait for the content script to be ready, then send `{action:'extract'}`
        — identical to the three existing non-popup trigger paths — reusing
        the existing `showToast` for progress ("Exporting 3 of 12…")
     c. collect `{title, markdown}` from the response
     d. `chrome.tabs.remove(tabId)`
     e. small delay before the next tab (don't hammer the site)
  4. Aggregate through the **existing** `buildZip()` (already used by "Export
     All" formats) — one file per conversation, named via the existing
     `buildFilename()` template.
  5. Errors are per-conversation, not fatal to the run: a tab that fails to
     load or returns empty extraction is skipped and counted in a final
     "N succeeded, M skipped" summary toast.

  **ChatGPT sidebar selectors — confirmed live 2026-07** (Claude still
  unverified, no logged-in Claude tab was available this session):
  `a[href^="/c/"]` reliably finds every conversation link, each wrapped in
  `<li class="list-none">` and carrying a `data-sidebarItem` attribute — a
  stable marker that isn't part of a generated/obfuscated class name, so it's
  a solid extraction anchor. `aria-label` matches the link's visible title
  text exactly (redundant with `textContent`, but a good fallback if the link
  ever gets an icon/nested-span structure that muddies `textContent`). The
  `href` gives the conversation's `/c/<uuid>` path directly — exactly the
  `{title, url}` pair the orchestration sketch above needs. The scrollable
  container is the `<nav>` with `overflow-y: auto/scroll` where
  `scrollHeight > clientHeight` (class name includes `scrollport`, but that's
  not guaranteed stable — detect by computed style + scroll dimensions instead
  of hardcoding the class). **Lazy-load behavior inconclusive**: this account
  only has ~28 conversations, all already mounted in the DOM on load —
  scrolling the nav container to its actual max `scrollTop` (verified the
  scroll math is right: reached exactly `scrollHeight - clientHeight`)
  triggered no additional loading because there was nothing more to load. The
  scroll-then-requery mechanism is validated as the right general approach,
  but true pagination/virtualization behavior (what happens with hundreds of
  conversations) is still unverified — needs an account with much more
  history to actually observe.
  - Realistic per-tab load timeout per platform (chatgpt/gemini/aistudio are
    already known to be slow lazy-loaders from the streaming-toast work).
  - How many conversations per run before it risks looking bot-like or
    tripping a platform rate limit — no data yet, needs real-account testing.

  Spend the first coding session on the sidebar-enumeration spike (step 1
  above) against a real logged-in account, not on the full orchestration.

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
