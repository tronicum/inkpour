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
- [x] **S** (optional) Collapsible sections: `<details>` per `<section>`
  (4 sections, settings.html:193–392). Scannability only — doesn't fix
  "forgot to save" by itself; skip if session budget is tight.
  Done — all 5 sections (Language, Export, Direct-to-vault, Integrations,
  Advanced — one more than the original note counted, since Direct-to-vault
  landed later in Batch 6) converted from `<section><h2>` to
  `<details class="settings-section" open><summary><h2>`, all starting
  `open` so the default view is pixel-identical to before. Custom chevron
  marker (rotates on open/close) replaces the native `::marker` triangle.
  The Direct-to-vault section's existing `hidden`/`style.display` Chrome-
  only feature-detect toggle (settings.js `initVaultSection()`) is
  untouched and confirmed still correct — `hidden`/`display` and `<details
  open>` are independent concerns, verified via a quick JSDOM parse (5
  `details.settings-section` elements, correct open/hidden state each, zero
  leftover `<section>` tags). No JS or test file referenced the `<section>`
  tag name, so nothing else needed updating; full suite still 281 passed,
  0 failed.

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

## Batch 4b — Bigger "you can export this" toolbar signal (Stefan's UX feedback, 2026-07)
- [x] **S** Stefan compared the existing "ON" badge to uBlock Origin/Bitwarden's
  much more noticeable toolbar badges and asked for something bigger — but
  explicitly not a number, and no click/interaction needed on supported
  pages (it should stay a passive state signal, same as today).
  Done — the native OS badge corner (`action.setBadgeText`) is fixed-size by
  the browser itself; no manifest/API setting can make its text or
  background any bigger, so that lever was a dead end. First attempt baked
  a green checkmark badge into the icon's corner — Stefan flagged (live,
  looking at the real 32px rendering) that it visibly overlapped/clipped
  the logo's arrow at that size, which is a real regression in a different
  direction (legible size fixed, but now covering the brand mark). Replaced
  with a full-icon recolor instead: `icons/icon-{16,32,48,96,128}-active.png`
  (generated via Pillow) is the *same* logo art, hue-shifted from its
  original purple/blue gradient to green (`#16a34a`'s hue, ≈142°) — nothing
  drawn on top, so the arrow/lines stay 100% intact and legible at every
  size including 16px, confirmed by inspecting a 16x nearest-neighbor
  upscale of the 16px output. Implementation: convert to HSV, shift the H
  channel to the target hue only for pixels above a saturation threshold
  (~30/255 — cleanly separates the colorful background gradient, sat.
  ~146-148, from the pure-white glyph pixels, sat. 0), leaving S/V
  untouched so the original gradient's shading/highlight pattern is
  preserved, just in green instead of purple/blue. Swapped in per-tab via
  `api.action.setIcon()` in `background.js`'s existing `updateBadge()` —
  same passive, no-click mechanism as before, just operating on the icon
  bitmap (which we fully control) instead of the OS-constrained badge
  overlay. Dropped the native `setBadgeText('ON', …)` call entirely for the
  supported case (would otherwise sit on top of the recolored icon) but
  kept an explicit `setBadgeText({text:''})` call to clear out any stale
  "ON" text a previous version of the extension may have left behind on an
  already-open tab after updating. 5 new JSDOM tests guard against this
  silently regressing: all 4 manifest icon sizes have a matching `-active`
  file referenced in `background.js`, every referenced file exists/is
  non-empty, each active variant is confirmed to actually differ from its
  default counterpart (byte comparison — catches an accidental
  copy-paste-without-editing mistake), each is a structurally valid PNG at
  its declared size (parsed the IHDR chunk directly, no dependency added),
  and the stale-badge-clearing call is still present. Also added the 4
  active icon files to the CI "required files" check
  (`.github/workflows/ci.yml`) alongside the existing icon-48/icon-96
  entries. Full suite 281→286 passed, 0 failed (unchanged by the recolor
  rework — same 5 tests, same file names, just different pixel content).
  **Real bug found and fixed after Stefan reloaded the unpacked extension
  and didn't see the green icon at all**: `updateBadge()` only ran from
  `tabs.onUpdated` (fires on navigation) and `tabs.onActivated` (fires on
  switching TO a tab) — reloading the extension itself, while an
  already-open tab was already the focused one, triggers neither, so that
  tab's icon just never got told to update. Fixed with a new
  `syncAllTabIcons()` that queries every open tab and runs the same
  `updateBadge()` on each, wired to both `runtime.onInstalled` (fires on
  install/update/every unpacked-reload) and `runtime.onStartup` (browser
  restart, restoring previously-open tabs). 2 more JSDOM tests added (288
  total, 0 failed) checking both listeners are wired and that the sync
  queries *all* tabs, not just the active one. Still **not yet verified**:
  how the green actually reads in a real Chrome/Firefox toolbar (dark vs.
  light toolbar theme, native DPI) — image generation and JSDOM-level
  checks were done in this sandbox, but there's no way to render an actual
  browser toolbar here. The corner-badge version was already caught and
  rejected this way (Stefan looking at the real rendering, not something a
  screenshot in this sandbox could have caught either), so the same live
  look is worth a second glance after reloading again with this fix.

## Batch 4c — Popup layout: split export button replaces the button grid (Stefan's UX feedback, 2026-07)
- [x] **M** Stefan flagged the popup as crowded — a screenshot showed up to
  11 buttons visible at once (MD/PDF/HTML/JSON/DOCX, Copy MD/Copy HTML/ZIP,
  Gist↑/Notion↑ once configured, Export All). Brainstormed three directions
  (overflow menu / format-selector + single button / just tighten spacing);
  Stefan picked a synthesis: a GitHub-style split button (primary face +
  caret) where the caret opens a menu holding everything else, including
  folding Gist/Notion into that same menu instead of separate always-there
  buttons. Design choices settled during the brainstorm: the primary face
  remembers the most recently used format (not a static setting), Copy MD/
  Copy HTML stay as plain menu rows (no separate copy-vs-download icon
  toggle), and the other popup sections (batch export, select-messages,
  notes) were explicitly left out of scope.
  Done — `popup.html`'s "Export as" label + three `.btn-group` rows
  (formats / copy+zip+gist+notion / Export All) replaced with a
  `.split-export` control (`#exportPrimaryBtn` + `#exportCaretBtn`) and a
  collapsible `#exportMenu`. Critically, **the menu contains the exact same
  11 button elements, same ids** (`mdBtn`, `pdfBtn`, …, `gistBtn`,
  `notionBtn`) that used to sit directly in the grid — only their
  container/CSS class changed from `.btn` grid cells to `.export-menu-item`
  rows — so every existing click handler in `popup.js` (extraction,
  vault-write branching, Gist/Notion upload, webhook firing, history
  persistence, etc.) keeps running completely unmodified. The redesign
  only adds a thin layer on top:
  - `FORMAT_TO_BTN` maps each format string to its (now-hidden-until-
    opened) button element.
  - `exportPrimaryBtn`'s click just does
    `FORMAT_TO_BTN[preferredFormat]?.click()` — a proxy dispatch to the
    real, unmodified handler.
  - Each of the 11 buttons gets one extra lightweight listener (alongside
    its pre-existing real handler — multiple listeners on one element
    don't interfere with each other) that updates `preferredFormat` and
    closes the menu; the real export logic is untouched.
  - `preferredFormat` is seeded on popup open from `inkpour_last_export`
    .format — a field `saveLastExport()` already wrote on every successful
    export, reused as-is, no new storage key needed — falling back to the
    existing "Default format" setting before anything's ever been
    exported. Nested inside the existing settings-load callback so the
    fallback value is guaranteed to be the real configured default, not
    the synchronous placeholder.
  - `setLoading()` (the one shared helper every handler already calls) got
    one additive line mirroring its disabled/spinner state onto
    `exportPrimaryBtn`, so the visible button shows progress regardless of
    whether the action was triggered via the primary face or by opening
    the menu and clicking a row directly.
  - Gist/Notion's existing show-only-when-configured gating
    (`gistBtn.hidden`/`notionBtn.hidden`) is completely unchanged — they
    just now toggle visibility of a menu row instead of a grid button.
  - Menu closes on: picking any item, clicking anywhere outside
    `.split-export`/`.export-menu`, or pressing Escape.
  - 2 new i18n keys (`popupExportMoreOptions` — the caret's tooltip;
    `popupBtnAllShort` — a short "All" label for the primary face when the
    preferred format is Export All, since its real button's full label
    "⬇ Export All (MD + DOCX + ZIP)" is too long for the compact face),
    translated to all 26 locales (25 via subagent, matching each locale's
    existing `popupBtnExportAll` tone, spot-checked + full key-set diff —
    zero mismatches). Every other menu label reuses its pre-existing i18n
    key verbatim — zero new translation work needed for those.
  - 8 new structural JSDOM tests (popup.js/popup.html aren't executed by
    this harness — same `chrome.tabs`/`chrome.runtime`-dependency reason
    background.js has none either — so these parse popup.html and grep
    popup.js's source instead): primary face/caret/menu all exist, all 11
    original buttons still exist *inside* the menu with their original
    ids, the old grid/label classes are gone, debug-mode buttons were left
    alone outside the menu, `FORMAT_TO_BTN` covers all 11 formats,
    `setLoading()` mirrors onto the primary face, the primary face proxies
    to the preferred format, and the preferred-format seeding logic is
    present. Full suite 288→296 passed, 0 failed.
  - Updated the 5 Playwright e2e tests that referenced the old grid
    directly (`#mdBtn`/`.export-label` visible-by-default assertions) to
    match the new structure, and added 5 new ones covering the menu
    open/close/pick behavior specifically. **Not run in this sandbox** —
    same Playwright Chromium-binary-download network restriction as the
    batch-export toggle test earlier; syntax-verified via `node -c` only.
    Needs a real run in CI or on Stefan's machine.
  - **Not yet verified**: actual visual/spacing rendering in a real
    browser popup (320px wide) — CSS was written to reuse existing
    variables/patterns (`.btn`'s spinner/loading convention, the existing
    accent color scheme) and reviewed for cascade-order correctness (the
    `.export-menu-item` overrides are deliberately placed after `.btn` in
    the stylesheet so they win at equal specificity — verified by parsing
    popup.html, not by rendering it), but there's no way to screenshot a
    real popup in this sandbox. Please take a look after reloading.

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
- [ ] **L → investigated live, still L, not implemented** Claude Artifacts —
  investigated live 2026-07 against a real logged-in Claude account, creating
  two artifacts (Python + JS) in one conversation. Unlike ChatGPT Canvas, this
  one really does need the multi-session/side-panel handling the original
  note assumed — confirmed structure:
  - Each artifact shows as a small preview card in the chat column
    (`.artifact-block-cell`, matched 2/2 as expected) with just a title +
    filetype badge (e.g. "Reverse string · PY") — **no code inside it at all**.
    This is exactly why the CURRENT `artifactSuffix` logic in `extractClaude()`
    (`clone.querySelectorAll('.artifact-block-cell, [class*="artifact-block"]')`
    then `artEl.querySelector('code, pre, .cm-content, ...')`) silently
    extracts nothing today — that querySelector has nothing to find inside the
    card. Confirmed live: Claude Artifacts exports currently ship with ZERO
    artifact content, only whatever prose summary the model writes alongside
    the card (e.g. "Here's a simple script that reverses a string...").
  - The actual code lives in a completely separate right-side panel, anchored
    by a distinctive, likely-stable id: `#wiggle-file-content` (confirmed
    outside any `[data-testid="user-message"]`/`[data-testid="assistant-message"]`
    turn — `.closest()` on those returns nothing). Its `textContent` is clean
    code but each line is prefixed with a line-number gutter baked into the
    same text flow (`"  1 def reverse_string(s: str) -> str:\n  2     return..."`)
    — needs a per-line strip (e.g. `/^\s*\d+\s?/` per line) before use.
  - **Only one artifact's content is ever mounted in the DOM at a time** —
    confirmed with 2 real artifacts open in one conversation: `.artifact-block-cell`
    count was 2, but `#wiggle-file-content` count stayed 1, showing whichever
    artifact was created/opened most recently. Getting ALL artifacts in a
    multi-artifact conversation requires clicking each preview card in turn,
    reading the panel after each click, same click-through requirement found
    for NotebookLM citations — but proportionally far less disruptive here
    (a conversation typically has a handful of artifacts, not up to 192).
  - **Real implementation gotcha confirmed live**: a bare `cardEl.click()` via
    injected JS did NOT swap the panel (tried it, panel didn't change) — only
    a genuine synthetic mouse click (dispatched via the browser's real input
    pipeline, not the DOM `.click()` method) actually triggered the swap.
    A real fix will need to dispatch a proper `MouseEvent` sequence
    (mousedown/mouseup/click, `bubbles: true`) rather than `el.click()`.
  - Not attempted as a fix this session: this needs (a) the synthetic-click
    mechanism above validated more rigorously, (b) correctly associating each
    extracted artifact's content back to the message/turn that created it
    (the panel is conversation-wide, not turn-scoped, so this needs tracking
    which card belongs to which turn), and (c) testing across Claude's other
    artifact types (React components, HTML, SVG, Mermaid, plain markdown) —
    which likely render very differently inside `#wiggle-file-content` than
    the plain-code case tested here. Genuinely multi-session work, matching
    the original L estimate — unlike Canvas, this one didn't shrink.
  - **Synthetic-click mechanism — conclusively ruled out 2026-07, downgrading
    this item's viability**: re-tested live against the same 2-artifact
    conversation with a much more thorough synthetic sequence than a bare
    `.click()` — `pointerdown` → `mousedown` → `pointerup` → `mouseup` →
    `click`, all `bubbles:true, cancelable:true`, with real `clientX/clientY`
    coordinates from the card's actual `getBoundingClientRect()` (i.e.
    everything a real click event carries, not just a bare `.click()` call).
    Confirmed via before/after `#wiggle-file-content` text comparison: still
    NO swap. Only a genuinely OS-level input event (dispatched through
    Chrome's real input pipeline, e.g. what the `computer`/CDP tool used in
    the original investigation, or equivalently `chrome.debugger`'s
    `Input.dispatchMouseEvent`) triggers it. This means the gap isn't "using
    the wrong DOM event type" as first hoped — it's that Claude's frontend
    (likely a Radix/shadcn-style component checking real pointer capture or
    `event.isTrusted`) rejects any JS-dispatched event regardless of how
    complete the sequence is. A content script has no way to produce a
    trusted input event; the only extension-side mechanism that can is the
    `chrome.debugger` API, which requires the `debugger` permission — a
    heavy, scary ask (Chrome shows a persistent "Inkpour is debugging this
    browser" banner the whole time it's attached) for what should be a
    read-only export feature, and a plausible Chrome Web Store review
    friction point. Each artifact card also has its own "Download" button
    (confirmed present, not clicked live to avoid triggering a real file
    save on Stefan's machine) that likely goes through the same
    click-handler gating, so it's probably not a viable synthetic-click
    workaround either — not tested further given the download side effect.
    **Recommendation: don't pursue the click-through approach further.**
    Either accept the current zero-content-artifact limitation as a known
    gap (document it plainly for users instead), or revisit only if a
    non-click extraction path turns up (e.g. Claude ships a stable
    public/internal API for artifact content, or a future DOM version
    embeds all artifacts' content up front instead of swapping one panel).
    Downgrading from "L, not implemented" to effectively blocked pending a
    non-click approach — not purely a matter of more engineering time.
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
  of hardcoding the class). **Lazy-load behavior — confirmed live via
  bulk-create test 2026-07**: an earlier test that set `nav.scrollTop =
  nav.scrollHeight` as an instant jump reached the correct max scroll position
  but triggered ZERO additional loading, which was wrongly read as "nothing
  more to load." Bulk-creating extra test conversations and retrying showed
  the real mechanism: a loop of small incremental `scrollTop += 40-60` steps,
  each followed by `nav.dispatchEvent(new Event('scroll', {bubbles:true}))`
  and a short (150-300ms) wait, DOES trigger real lazy-loading — count jumped
  28 → 56, then stabilized exactly at `scrollTop === scrollHeight -
  clientHeight` (true max) with no further growth. This means the lazy-load
  trigger is very likely an IntersectionObserver-style sentinel that only
  fires on genuine progressive scroll events, not an instant `scrollTop`
  assignment. **Implementation implication for Batch 8 orchestration code**:
  the background-tab scroll-to-load-more step must simulate real incremental
  scrolling (small steps + dispatched scroll events + waits between them),
  not a single jump to max scrollTop, or it will silently under-collect
  conversations on accounts with more history than fits in the initial page.

  **Claude sidebar selectors — confirmed live 2026-07**: `a[href^="/chat/"]`
  reliably finds every conversation link. Unlike ChatGPT, the visible/`textContent`
  title is DOUBLED (e.g. `"Debugging old Raspberry Pi firmwareDebugging old
  Raspberry Pi firmware"`) — confirmed why: each link contains both a
  `.sr-only` span (screen-reader-only, full clean title) and a sibling
  `aria-hidden="true"` `.block.truncate` span (the visually-truncated display
  copy) with the same text, so naive `textContent` concatenates both. Use
  `link.querySelector('.sr-only')?.textContent` for a clean single-instance
  title instead. More importantly: Claude has a dedicated, separate
  **`/recents` page** ("Chats" in the sidebar nav) with a full searchable/
  filterable list, distinct from the abbreviated sidebar preview — it even
  ships its own native "Select chats" multi-select button already, and is a
  much better enumeration target for Batch 8 than scraping the sidebar
  (search, filter-by, and timestamps are all already there for free). Same
  lazy-load caveat as ChatGPT: this account only has 7 conversations total, so
  no pagination could be observed either way.
  - Realistic per-tab load timeout per platform (chatgpt/gemini/aistudio are
    already known to be slow lazy-loaders from the streaming-toast work).
  - How many conversations per run before it risks looking bot-like or
    tripping a platform rate limit — no data yet, needs real-account testing.

  Spend the first coding session on the sidebar-enumeration spike (step 1
  above) against a real logged-in account, not on the full orchestration.

  **Step 1 spike — implemented and verified live 2026-07**: added
  `getConversationList()` to `src/content.js` (right after `detectSite()`)
  plus a new `{action:'getConversationList'}` message handler, returning
  `{conversations: [{title, url}]}`. Encodes exactly the selectors confirmed
  above (ChatGPT: `a[href^="/c/"]`, title from `aria-label`; Claude:
  `a[href^="/chat/"]`, title from `.sr-only`), de-duplicated by resolved
  absolute URL. Returns `[]` (not an error) for any unsupported/logged-out
  page — this is the feature's natural feature-detect point, so popup.js's
  future entry point can just check `conversations.length` to decide whether
  to show the batch-export UI at all, never gating the existing
  single-conversation extraction path. Exposed via the existing test-hook
  pattern (`window.__inkpourGetConversationList`, gated on
  `window.__inkpourTestHostname`, same as `__inkpourHtmlToMarkdown`). 7 new
  JSDOM tests added (ChatGPT: finds every unique link, title from
  aria-label, absolute-URL resolution, de-dup of a same-href double DOM
  entry; Claude: finds every link, `.sr-only`-based de-doubled title;
  unsupported platform: returns `[]` without throwing) — full suite
  271→278 passed, 0 failed. **Live-verified against the real open
  ChatGPT/Claude tabs from this session's earlier cleanup work**: re-ran the
  equivalent selector logic directly in both tabs via injected JS — ChatGPT
  returned the correct 28 conversations (back to baseline post-cleanup) with
  clean titles and correct `/c/<uuid>` paths; Claude returned 8 conversations
  with correctly de-doubled titles (e.g. "Debugging old Raspberry Pi
  firmware", not the doubled textContent). Not yet done: the popup.js picker
  UI and the background.js tab-cycling orchestration itself (steps 2-5 of
  the sketch above) — this session only covered step 1 as scoped.

  **Steps 2-5 — implemented 2026-07, pending live test (same status as
  Batch 5/6 when they landed)**:
  - `popup.html`/`popup.js`: a new "Batch export past conversations…" toggle
    (styled/behaving exactly like the existing "Select messages" toggle)
    appears only when `getConversationList()` returns a non-empty list for
    the current tab — `initBatchExport()` queries it once at popup open,
    alongside the existing `runPeek()`, and simply does nothing (stays
    silent, toggle stays `hidden`) on any page where it's empty. Ticking
    conversations and clicking "Export selected as ZIP" sends
    `{action:'startBatchExport', conversations, originTabId}` to
    background.js and shows the returned `{succeeded, skipped}` summary.
  - `background.js`: new `runBatchExport()` — the actual sequential
    background-tab loop, living entirely in the service worker so it
    survives the popup closing (this was the whole reason the design sketch
    chose background-tab automation over hijacking the active tab). Per
    conversation: `tabs.create({active:false})` → `waitForTabLoad()` (new
    helper, 20s timeout) → a fixed 1.5s settle delay → `{action:'extract'}`
    with a 15s race-timeout → on success, `buildMarkdown()` + `buildFilename()`
    (both already `importScripts`-loaded here, same as every other
    background.js export path) into one `.md` file per conversation, with a
    `-2`/`-3` suffix if two conversations resolve to the same filename →
    `tabs.remove()` in a `finally`, then an 800ms pause before the next tab.
    Failures are caught per-conversation (counted as skipped, never abort
    the run — matches the original "errors are per-conversation, not fatal"
    design). All conversations' `.md` files are aggregated into one ZIP via
    the existing `buildZip()` and downloaded via the existing
    `safeDownload()`/`withSubfolder()` helpers, named
    `inkpour-batch-<YYYY-MM-DD>.zip`. Progress and the final summary are
    sent as toasts to the *originating* tab (`originTabId`, captured by
    popup.js before sending the message) via the existing `showToast`
    content-script action — reused exactly as-is, no new toast mechanism.
  - 9 new i18n keys (`popupBatchExportToggle`/`StartBtnTitle`/`StartBtn`/
    `Count`/`NoneSelected`/`Starting`/`Progress`/`Done`/`Failed`), added with
    real (non-stub) translations to all 26 locales — 25 done by parallel
    subagents, then spot-checked directly (`de`/`ar` samples) plus a full
    programmatic key-set diff against `en/messages.json` across all 26
    files (zero mismatches). Full suite 281 passed, 0 failed throughout
    (content.js's own 7 Batch-8 tests from the step-1 spike are unaffected;
    no JSDOM coverage was attempted for popup.js/background.js themselves —
    see below for why).
  - One new Playwright e2e test added (`test/e2e/popup.spec.js`, "batch
    export toggle stays hidden with no chat page open") asserting the
    single most safety-critical property: the feature never appears where
    it can't work. **Not run in this sandbox** — Playwright's Chromium
    binary download failed here (network-restricted sandbox, `502` from
    both of Playwright's CDN mirrors); the test's syntax was verified
    (`node -c`) and it follows the exact pattern of the existing adjacent
    test ("shows error when no chat page is open"), but it needs a real run
    in CI or Stefan's machine to confirm it actually passes.
  - **Why no JSDOM coverage of popup.js/background.js**: consistent with
    how this whole file already works — `test/run-jsdom.js` has never
    loaded either file (both depend on `chrome.tabs`/`chrome.runtime` APIs
    that don't exist in JSDOM, unlike `src/content.js`/`src/utils.js` which
    are pure-DOM/pure-function and get full JSDOM coverage). This isn't a
    gap specific to this feature.
  - **Known gaps / explicitly NOT resolved by this pass** (matches the
    design sketch's own open questions, still open): the 20s tab-load
    timeout, 1.5s settle delay, and 15s extract timeout are reasonable
    starting guesses, not measured against real slow-loading accounts
    (ChatGPT/Gemini/AI Studio are already known to be slow lazy-loaders
    elsewhere in this codebase); how many conversations per run is safe
    before it risks looking bot-like or tripping a platform rate limit is
    still completely unmeasured — no data existed before this pass and none
    was generated now, since generating it would mean running a large real
    batch against a live account, which needs an explicit go-ahead (this
    repo's session history shows real caution here: Stefan explicitly
    scoped an earlier bulk-conversation-creation test to "ChatGPT only", so
    a large-N live batch-export test should get the same explicit scoping
    before anyone runs one). **This needs a real, watched, small-N (e.g.
    3-5 conversations) live test on Stefan's own ChatGPT and Claude
    accounts before being considered done** — same "implemented, pending
    live test" status Batch 5 (Notion) and Batch 6 (vault) shipped in, not
    a claim that this is fully verified.

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

**Release notes source — `CHANGELOG.md` added 2026-07**: rather than
inventing a release-notes format when this batch actually gets built, a
`CHANGELOG.md` now exists at repo root, one `## [x.y.z.w]` section per
tagged version (backfilled for the full history, `v0.2.0` through the
current `v0.4.28.1`), plus an `## [Unreleased]` section at the top that
should get renamed to the new version heading in the same commit as every
future version bump. A JSDOM test (`test/run-jsdom.js`, "CHANGELOG.md —
release notes source of truth") guards against drift: fails if the current
`manifest.json` version has no matching section, if the `Unreleased` heading
ever goes missing, or if a heading doesn't correspond to either
`Unreleased`, the current version, or a real git tag. When Batch 10's
workflow job runs, it should extract the section between the tag's own
`## [x.y.z.w]` heading and the next `## [` heading and pass that text as:
  - AMO's `release_notes` field (per-locale in the submission API's
    `--amo-metadata` JSON — English text is enough for v1, matching this
    repo's English-first i18n rollout elsewhere)
  - the Chrome Web Store listing has no real per-version "what's new" API
    field as of this writing (unlike AMO) — store the same extracted text
    as the GitHub Release body instead (already generated via
    `generate_release_notes: true` in `release.yml`; consider swapping that
    for this file's text once Batch 10 lands, since it'll read better than
    GitHub's auto-generated commit-list) and skip trying to push it to CWS.

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
