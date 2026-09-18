# AGENTS.md

Reference for anyone (human or AI coding agent) making a change to Inkpour.
Dense on purpose — see `DEVELOPING.md` for the narrative walkthrough version.

Inkpour is a cross-browser (Chrome/Firefox/Edge/Safari) Manifest V3
WebExtension that exports AI chat conversations — ChatGPT, Claude, Gemini,
Copilot, Google AI Mode, and ~20 more — to Markdown/PDF/HTML/JSON/DOCX.

## Where things actually live

- `manifest.json` — the MV3 manifest. `content_scripts` maps every supported
  site's URL pattern to one file: `src/content.js`. Adding a new site starts
  here.
- `src/content.js` — the real content script (one big IIFE, ~2,500 lines).
  Contains one `extract<Platform>()` function per supported site (`grep
  "function extract" src/content.js`), shared HTML→Markdown conversion
  (`htmlToMarkdown`), the in-page floating export button, toast UI,
  navigation watching, and all Debug-mode tooling (below). **This is where
  extraction logic lives** — see the dead-code warning next.
- `src/utils.js` — shared pure builders (`buildMarkdown`, `buildDocx`,
  `buildFilename`, `buildZip`, …), loaded as plain globals (not ES modules,
  for `importScripts`/service-worker compatibility). Used by `popup.js` and
  `background.js`.
- `src/i18n.js` — `applyI18n(document)` / `t(key, subs)`. 26 locales under
  `_locales/<locale>/messages.json`; a test enforces identical key sets
  across all of them.
- `src/vaultHandle.js` — direct-to-vault (File System Access API) plumbing:
  `getVaultHandle()` / `setVaultHandle()` / `clearVaultHandle()` /
  `shouldRequestPermission()`.
- `background.js` — service worker: keyboard shortcuts, context menus,
  webhook-on-export.
- `popup.html` / `popup.js` — toolbar popup. Quick actions (Copy MD, ZIP)
  plus an export format picker (dropdown + separate Export button, so
  picking a format never fires it immediately) plus the Debug-mode buttons:
  `#debugDomBtn`, `#reportBugBtn`, `#probeAiModeBtn`.
- `settings.html` / `settings.js` — options page (autosaves on change). Once
  "Debug mode" is toggled on, its "Local debug/fuzzing tools" section shows
  two real links (`#openImportDebugLink` / `#openPdfFuzzerLink` in
  `settings.js`, `api.tabs.create({ url: api.runtime.getURL('debug/...') })`)
  that open the pages under `debug/` in a new tab.
- `history.html` / `history.js` — export history (fuzzy search, re-download,
  star/pin).
- `debug/` — the two dev-tool pages Settings links to (above), plus their
  assets. Genuinely shipped in the release zip on every GitHub Release (not
  a source-only/dev-checkout-only thing) — just not surfaced in the popup's
  own UI, only via Settings: `import-debug.html` (paste-in import-parser
  tester), `import-pdf-fuzzer.html` + `.js` (PDF layout fuzzer, see below),
  `vendor/` (pdf.js, vendored locally — MV3's
  `script-src 'self'` CSP blocks both a CDN `<script src>` and any inline
  `<script>` block). `debug/input/*`, `debug/playonwords`, and
  `debug/rendertest.pdf` are personal local test fixtures, excluded from git
  and from the release zip (`.gitignore` + `scripts/release.sh` both list
  them individually — don't switch either to a blanket `debug/*` exclude,
  that was a real shipped-build bug once, see `CHANGELOG.md` 0.4.30.1).
- `scripts/release.sh` — **the single source of truth for what ships**.
  Used by `.github/workflows/release.yml`,
  `.github/workflows/midnight-snapshot.yml`, and manual local builds alike.
  A new top-level file/folder that shouldn't ship gets excluded here, never
  hand-duplicated into a workflow YAML's own `zip` step.
- `test/run-jsdom.js` — the real test suite (318 tests as of this writing),
  pure Node + JSDOM, no browser required: `npm test`. Loads
  `src/content.js` / `src/utils.js` / `src/vaultHandle.js` via
  `vm.runInThisContext` against real saved-page fixtures in
  `test/fixtures/` (one per platform).
- `test/e2e/*.spec.js` — Playwright. Cannot run in most sandboxes (needs a
  real browser download); treat as reference / run on a real machine.

### Dead code warning

`src/extractors/`, `src/exporters/`, and `src/browser/` look like a modular
per-platform architecture, but **nothing loads them** — not
`manifest.json`, not any `.html` file, not `content.js`. They're the
remains of an earlier refactor attempt. Every platform's real extraction
logic is an `extract<Platform>()` function inside `src/content.js`. Do not
edit `src/extractors/chatgpt.js` expecting it to affect ChatGPT exports —
it does nothing. (Worth deleting outright at some point; out of scope for
most changes.)

## Debug-mode tooling (Settings → toggle "Debug mode")

Three tools exist for diagnosing "extraction found nothing / found the
wrong thing" without needing a maintainer to reproduce it themselves:

1. **Copy debug info** (`#debugDomBtn` → `buildDebugReport()` in
   `content.js`) — a privacy-safe DOM skeleton (tag/class/safe attributes
   only; text reduced to character counts, never content) plus
   selector-match counts against `DEBUG_SELECTOR_CHECKLIST`. First move for
   "this site changed its DOM."
2. **Probe AI Mode** (`#probeAiModeBtn` → `startGoogleAiModeProbe()`) —
   Google AI Mode only, for now. Fills a unique marker string into the
   query box using the native-setter + real-event technique (not
   `el.value =`, which React-style UIs silently ignore), then a
   `MutationObserver` (60s timeout) waits for you to press send yourself
   and the marker to land in the page. On success it copies a report of
   the exact tag/class/role/`jsname` chain wrapping every place the marker
   appeared — both the "user turn" and "AI turn" shape, from one prompt.
   Deliberately never simulates the send click (already proven unreliable
   for React-style send buttons elsewhere in this codebase) — you press
   send.
3. **PDF import fuzzer** (Settings → Debug mode → "PDF import fuzzer →",
   opens `debug/import-pdf-fuzzer.html`) — for the PDF-paste-back-in import
   feature. Parses a PDF via pdf.js, tries several line-gap thresholds
   (`FUZZ_FACTORS` in `import-pdf-fuzzer.js`) to split it into
   paragraphs/turns, and shows every candidate result so you can pick (or
   debug) whichever best reconstructs a printed/exported chat transcript.
   Point it at a real problem PDF via the file picker.

## Testing

```
npm test              # 318 JSDOM tests, no browser needed — run before any commit
```

Fixtures live in `test/fixtures/`, one real saved HTML page per platform.
A new platform or a selector fix should come with a fixture + assertions,
not just "checked it manually in the browser."

## Branching model

- **`main` is release-only.** Nothing lands here except a merge from `dev`,
  done deliberately when a batch of features is actually ready to ship.
  Every commit on `main` is tag-ready by definition — no ambiguity about
  whether a given commit was "meant" to be released.
- **`dev` is the integration branch.** Every feature branch (`feat/...`,
  `fix/...`) branches off `dev` and PRs back into `dev`, not `main`. This is
  what gets tested locally (point the unpacked extension at the feature
  branch, or at `dev` once merged) before anything is release-ready.
- **Tags only ever get cut on `main`**, immediately after a `dev` → `main`
  merge, triggering `release.yml` (Firefox/Chrome/Edge auto-submit). This
  part is unchanged — see Release / build below.
- Adopted 2026-09-18 (a `dev` branch already existed in `ci.yml`'s trigger
  list from the project's early days, but had gone unused/stale — this
  formalizes actually using it).

## Release / build

`bash scripts/release.sh [version]` builds the exact zip that ships
(defaults to `manifest.json`'s version). Same script backs
`release.yml` (tag-triggered, real releases, `main` only) and
`midnight-snapshot.yml` (manual or `*snapshot*`-tag-triggered, disposable
test builds — see `DEVELOPING.md` for when to reach for a snapshot instead
of a real release).

## Conventions worth knowing before touching UI/DOM code

- **Filling a real `<textarea>`/`<input>`/contenteditable** so a
  React/Angular-style page notices: use the native-setter + real
  `input`/`change`-event technique (see `fillProbeInput` in
  `content.js`). A plain `el.value = x` is silently ignored.
- **Detecting "did my action land"** on a page you don't control: prefer a
  `MutationObserver` watching for expected content over hunting for a
  site's fragile submit-button/form selector (see `watchForProbeMarker`).
  Selectors for buttons/forms break far more often than watching for the
  content those actions are supposed to produce.
- **Synthetic clicks are not reliable** for triggering React-style actions
  (proven false for Claude Artifacts' panel-swap even with a full
  `pointerdown→mousedown→pointerup→mouseup→click` sequence) — don't reach
  for `.click()` simulation as a first resort.
- `api = (typeof browser !== 'undefined') ? browser : chrome` — the
  cross-browser shim used everywhere. Use `api.*`, never `chrome.*` or
  `browser.*` directly.

## Scratch work / tooling rules for agents

- **Scratch files stay inside the repo, in the gitignored `tmp/` directory**
  — never write drafts, notes, build artifacts, or intermediate output to
  `/tmp`, `/private/tmp`, or any path outside this project directory. This
  includes `mktemp`/`mktemp -d` — both default to a system temp dir outside
  the repo; if you need a scratch subdirectory, make one under `tmp/`
  directly (`mkdir -p tmp/whatever`) instead.
- **No `perl` for text/regex processing.** Node is the only scripting
  runtime this project tolerates for build/dev tooling (see
  `bookmarklet/build.js` for the pattern: plain Node, no new dependency,
  no shelling out to another language for something a few lines of JS
  already does).
