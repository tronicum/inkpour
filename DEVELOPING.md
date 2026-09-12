# Developing Inkpour

A ~5-minute orientation for anyone (future you included) picking this repo
back up to fix a bug or make a small change. `README.md` covers features and
install steps for users; `AGENTS.md` is the dense reference for pointing an
AI coding agent at. This file is the guided tour in between.

## Architecture in 90 seconds

Inkpour is a Manifest V3 browser extension with no build step — every file
under version control is exactly the file the browser loads. The extraction
logic for every supported AI chat site lives in one place: `src/content.js`,
a single content script injected into every URL listed in `manifest.json`.
It's one big IIFE containing an `extract<Platform>()` function per site
(ChatGPT, Claude, Gemini, Google AI Mode, and ~20 others), shared
HTML→Markdown conversion, the in-page floating export button, and the
Debug-mode tooling described below.

Everything else fans out from there: `popup.js` is the toolbar popup
(format picker + Debug-mode buttons), `background.js` is the service worker
(shortcuts, context menus), `settings.js` is the options page, `src/utils.js`
holds shared builder functions (Markdown/DOCX/ZIP/filenames) used by both.
`scripts/release.sh` is the one place that decides what actually ships in a
release zip — CI workflows call it rather than re-implementing packaging.

**One trap worth knowing up front:** `src/extractors/`, `src/exporters/`,
and `src/browser/` look like a clean modular architecture but are dead code
— nothing loads them. The real per-site logic is the `extract<Platform>()`
functions inside `content.js`. If you go looking for "where does ChatGPT
extraction happen" and land in `src/extractors/chatgpt.js`, that's a dead
end; `grep "function extractChatGPT" src/content.js` instead.

## The debug tools you'll actually reach for

Turn on **Settings → Debug mode** first — it adds two buttons to the popup,
plus a "Local debug/fuzzing tools" section right there in Settings with
direct links to the third tool below. All three ship in every real release
zip (the one on GitHub Releases), not just in a dev checkout.

- **Copy debug info** — dumps a privacy-safe DOM skeleton (tag/class names
  and safe attributes only, never message text) plus counts of how many
  elements match each selector Inkpour depends on. Your first move whenever
  a site "used to work, now finds nothing."
- **Probe AI Mode** — Google AI Mode only, for now. Click it, then go type
  any question into the page yourself and press send (it deliberately
  never sends for you). Within 60 seconds of your reply appearing, it
  copies a report to your clipboard showing the exact DOM structure around
  both your question and the AI's reply. Paste that into whatever you're
  debugging with — it tells you precisely what changed.
- **PDF fuzzer** — Settings → Debug mode → "PDF import fuzzer →" link, for
  the "paste a printed/exported PDF back in" import feature. Feed it a real
  problem PDF; it tries several paragraph-detection thresholds and shows
  you every candidate result side by side.
- **The automated test suite** — not a popup/Settings tool, but the one
  you'll lean on most. `npm test` runs 318 JSDOM-based tests against real
  saved-page fixtures (`test/fixtures/`, one per platform) in a couple of
  seconds, no browser needed. Run it before you start (confirm the baseline
  is green) and after every change — it's what actually proves a DOM fix
  works, rather than "looked fine when I checked it manually."

## Fixing something that broke: the loop

Whether the trigger was a browser update, an OS update, or a site changing
its DOM, the process is the same — only step 2 differs by symptom.

**0. Plan out loud, then ask before doing anything that isn't trivially
reversible.** Before touching code — especially if you're driving this
through an AI coding agent — write down in plain language what you think
is broken and what you're about to change, and get an explicit go-ahead
before proceeding. Don't silently push past a checkpoint because the next
step "seemed obvious." This matters most right before: pushing a
tag/branch, opening a PR, changing a workflow file, or anything that
triggers CI (a tag push, for instance, is what fires both `release.yml`
and `midnight-snapshot.yml` — nothing runs on GitHub's side until you
actually push, so don't expect pipeline results to show up from local
commits alone). If you're working with an agent that keeps a visible task
list (breaking the fix into checkable steps), keep it updated as you go —
it's how you can tell what's actually happening instead of staring at a
silent terminal. If it's not visible, ask for it explicitly.

**1. Reproduce, and confirm the baseline is green.**
```bash
git clone https://github.com/tronicum/inkpour.git   # if starting fresh
cd inkpour && npm test                              # should say "318 passed, 0 failed"
```
Then load the unpacked extension in the affected browser (`about:debugging`
on Firefox, `chrome://extensions` → Developer mode → "Load unpacked" on
Chrome/Edge) and confirm you can actually see the bug.

**2. Diagnose with the right tool for the symptom.**
- *A site's DOM changed* — right-click the broken message bubble → Inspect,
  find its new class/attribute by hand, or turn on Debug mode and use
  **Copy debug info** to see selector-match counts at a glance. For Google
  AI Mode specifically, use **Probe AI Mode** instead — it's more surgical.
- *One browser flavor only* — check whether the fix is really extension-API
  related. Everywhere in this codebase, the call is `api.someMethod()`,
  never `chrome.*` or `browser.*` directly, so first confirm the bug isn't
  a spot that skipped the shim. Also check `manifest.json`'s
  `browser_specific_settings` for Firefox-only config drift. Orion (macOS)
  is a real, if unusual, case of this: it's WebKit-based but runs Chrome/
  Firefox extensions through its own WebExtensions implementation
  (~70% API coverage) — a symptom that only shows up there might just be a
  WebExtensions API this codebase uses that Orion hasn't implemented yet,
  not a bug in Inkpour itself. See README.md → "Supported browsers" for
  how to load it there.
- *An OS update only* — usually clipboard, downloads, or File System Access
  API behavior. Start in `src/vaultHandle.js` (direct-to-vault) or the
  downloads-permission code paths in `background.js`.

**3. Find and make the fix.** Grep for the relevant `extract<Platform>()`
function in `src/content.js`, or the relevant shared builder in
`src/utils.js`.

**4. Add or extend a fixture, then re-run the suite.** This is the actual
copy-and-paste step, not a placeholder — in the browser's DevTools console,
on the broken page:
```js
copy(document.documentElement.outerHTML)
```
That copies the live page's HTML to your clipboard. Paste it into a new
file under `test/fixtures/<platform>.html` (see the existing files there
for the naming convention), then redact anything personal before it goes
anywhere near a commit — real names, emails, anything you wouldn't want in
a public repo. Then:
```bash
npm test
```
Don't consider a DOM fix done until it's backed by a fixture — "I checked
it manually" doesn't survive the next unrelated DOM change.

**5. If you're using an AI coding agent** (Claude Code, Cursor, or similar),
point it at `AGENTS.md` before asking it to dig in — it has the file map,
the dead-code trap above, and the two DOM techniques already proven to
work (native-setter input filling, `MutationObserver` over synthetic
clicks) so the agent doesn't waste a cycle rediscovering them.

**6. Verify beyond your own machine with a Midnight Snapshot** — a
disposable build, no version bump or store submission needed:
```bash
git tag 20260801-my-fix-snapshot
git push origin 20260801-my-fix-snapshot
```
(or: Actions tab → "Midnight Snapshot" → "Run workflow" → pick your branch).
Download the resulting zip from that run's Artifacts tab on the other
browser/OS/machine and confirm the fix actually holds there — this is
exactly what the workflow exists for.

**7. Once confirmed, cut a real release** — separate from a snapshot: bump
`manifest.json`'s version, add a `CHANGELOG.md` entry, tag `vX.Y.Z.W`, push.
See `scripts/release.sh` and `.github/workflows/release.yml`.

## Branching model

Most of this project's history so far is direct commits to `main` — fine
for a true one-line fix, but not the default going forward for anything
that touches shipped behavior. The model:

- `main` is always releasable. Every real release tag (`vX.Y.Z.W`) is cut
  from `main`, never from a feature branch.
- Anything bigger than a one-line fix gets a short-lived branch off
  `main`: `fix/<short-name>` for bug fixes, `feat/<short-name>` for new
  behavior, `docs/<short-name>` for documentation-only changes.
- Snapshot builds don't care about branches at all — `midnight-snapshot.yml`
  triggers off any `*snapshot*` tag pushed from anywhere, so step 6 above
  (verify beyond your own machine) works straight from a feature branch,
  no need to merge to `main` first just to get a test build.
- Use `gh`, not raw `git push` alone, for the branch/PR lifecycle:

```bash
gh repo clone tronicum/inkpour        # once, if you don't already have a checkout
git checkout -b fix/google-ai-mode-selector
# ... make the fix, npm test ...
git commit -am "fix: ..."
git push -u origin fix/google-ai-mode-selector
gh pr create --fill                   # opens a PR against main
gh pr checks                          # watch CI on the PR
gh pr merge --squash                  # once approved and green
```

`gh` needs to be installed and authenticated once (`gh auth login`) on
whatever machine you're actually running these from — an AI coding agent
running in a sandboxed environment may not have `gh` available at all (no
package-manager root access, and GitHub's API can 403 an unauthenticated
direct binary download); in that case the agent should say so plainly and
hand the commands above back to you to run yourself, rather than quietly
falling back to pushing straight to `main`.

## Where to go next

- `README.md` — features, install instructions, supported platforms.
- `AGENTS.md` — dense architecture/convention reference, written for
  pointing an AI coding agent at.
- `planning/TODOs.md` — backlog, past batches, and the reasoning behind
  design decisions (why a `MutationObserver` over a submit-button
  selector, why the debug tools are scoped the way they are, etc.).
- `CHANGELOG.md` — what shipped, and when.
