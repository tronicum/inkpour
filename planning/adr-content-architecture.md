# ADR: `src/content.js` architecture — per-platform files, a selector data table, or neither

- **Status:** Proposed — this is a decision for the repo owner, not something
  being implemented. Nothing in this ADR has been built. The numbers below were
  re-derived from `main` on 2026-10-05 (`src/content.js` = 3,600 lines,
  `npm test` = **543 passed, 0 failed**), not taken from any earlier document.
- **Date:** 2026-10-05
- **Deciders:** Inkpour maintainers
- **Related:** `src/content.js` (the whole file; specifically `detectSite()`
  `:496`, `MESSAGE_ANCHORS` `:601`, `MESSAGE_TO_MD` `:999`, `extractClaudeFull()`
  / `runClaudeFullSweep()` `:767-875`, `findScrollContainer()` `:2195`,
  `scrollToLoadAll()` `:2208`, `isStreaming()` `:2257`, `extractMessages()`
  `:2346`, `DEBUG_SELECTOR_CHECKLIST` `:3180`), `background.js`
  (`SUPPORTED_HOSTS` `:660`, and the `runtime.getManifest()` precedent at
  `:278`), `popup.js` (`CHIP_HOSTS` `:175`), `manifest.json`
  (`content_scripts[0].matches`), `bookmarklet/src/inkpour-bookmarklet.js`
  (`:169-212`), `src/extractors/` + `src/exporters/` + `src/browser/` (dead,
  commit `cb1aaa2`, 2026-07-05), `test/run-jsdom.js` (`extractFromFixture()`
  `:114`, `loadContentScriptEnv()` `:184`), `test/fixtures/` (21 files),
  `AGENTS.md` ("Dead code warning"), `DEVELOPING.md` ("Architecture in 90
  seconds"), `tmp/inkpour-review-2026-09-24.md` §3 (the external review that
  proposed `src/sites.json`), `planning/adr-per-message-share-buttons.md`
  (format reference; also the origin of `MESSAGE_ANCHORS`/`MESSAGE_TO_MD`),
  `planning/adr-test-automation.md`

## Context

Two restructuring proposals are on the table for `src/content.js`:

1. **The maintainer's:** one file/module per supported site —
   `src/sites/chatgpt.js`, `src/sites/claude.js`, …
2. **The external review's** (`tmp/inkpour-review-2026-09-24.md` §3): the
   opposite — *fewer* extractors, replaced by a shared parameterized runner
   driven by `src/sites.json` rows of
   `{ host, userSel[], aiSel[], aiLabel, scroll, streamingSel }`, keeping only
   AI Studio, Gemini and Google AI Mode as real code. Its stated premise:
   "~20 of the 24 extractors are the same 8-line template with different
   selectors; a data table would delete ~800 lines."

Everything below was measured against `main` today.

### What is actually in `src/content.js`

28 functions match `^  (async )?function extract…`. They break down as:

- **24 real platform extractors** — one per `detectSite()` id, one per `case`
  in `extractMessages()`'s switch (`:2346`).
- `extractGoogleAiModeTurnsByGeometry()` — a helper of `extractGoogleAISearch()`.
- `extractGeneric()` — the fallback.
- `extractClaudeFull()` — a Claude-only wrapper over `extractClaude()`.
- `extractMessages()` — the dispatcher itself.

Total lines inside those 28 function bodies: **1,095**. The per-platform region
of the file (`:601` `MESSAGE_ANCHORS` through `:2160` end of
`extractGoogleAISearch`) is **1,560 lines**; adding `detectSite()`,
`isStreaming()`'s per-platform branches, `scrollToLoadAll()`'s platform
allow-list and `DEBUG_SELECTOR_CHECKLIST` brings per-platform knowledge to
roughly **1,700 of 3,600 lines — about 47%.**

The other ~1,900 lines are platform-agnostic machinery that no per-platform
split touches: `htmlToMarkdown()` + `convertNode()` + `convertList()` +
`convertTable()` (`:106-495`, ~390 lines), the floating FAB
(`injectInPageButton()` `:2458-2709`, ~250), per-message decoration
(`:2710-3120`, ~410), toast/debug/probe tooling (`:3122-3600`, ~480), and the
message-protocol listener. **This is the first number that matters: splitting
by platform leaves a ~1,900-line `content.js` behind and creates 24 files.**

### Are the extractors really "the same 8-line template"?

No. Measured per extractor — number of distinct non-`null` return paths, and
whether every message goes through one uniform
`htmlToMarkdown(el)` map (no `getAttribute`, `classList`, `closest`,
`querySelector` narrowing, or `textContent` special-casing):

| Extractor | lines | return paths | uniform map? |
|---|---|---|---|
| `extractGoogleAiModeTurnsByGeometry` | 97 | 9 | no (geometry) |
| `extractGoogleAISearch` | 88 | 4 | no |
| `extractNotebookLM` | 67 | 7 | no (citation registry) |
| `extractLmarena` | 66 | 6 | no (`getBoundingClientRect`) |
| `extractAIStudio` | 59 | 1 | no (click simulation, async) |
| `extractDeepSeek` | 58 | 6 | no (role by *absence* of `.ds-markdown`) |
| `extractGroq` | 56 | 7 | no (four selector tiers) |
| `extractDuckAI` | 48 | 5 | no |
| `extractPiAI` | 45 | 6 | no |
| `extractCharacterAI` | 43 | 5 | no (sibling walk, loop) |
| `extractVenice` | 39 | 2 | no (`closest()` exclusion filter, loop) |
| `extractHuggingChat` | 38 | 4 | no (per-role content selector) |
| `extractPoe` | 37 | 4 | no (bot name from ancestor lookup) |
| `extractMistral` | 35 | 4 | no (role by presence of a testid) |
| `extractCopilot` | 34 | 4 | no (three tiers; legacy `source` attribute) |
| `extractCohere` | 30 | 2 | **yes** (but two tiers) |
| `extractKagi` | 29 | 3 | no (attribute-driven roles) |
| `extractQwen` | 28 | 3 | no (container fallback tier) |
| `extractPerplexity` | 27 | 1 | **yes** (but two-tier user selector) |
| `extractMetaAI` | 27 | 3 | no (attribute-driven roles) |
| `extractZAI` | 21 | 3 | no (per-role content handling) |
| `extractGrok` | 15 | 2 | no (role from class, content narrowing) |
| `extractGemini` | 15 | 1 | no (async citation-chip hover) |
| `extractChatGPT` | 9 | 2 | no (role attribute + Canvas extraction) |
| `extractClaude` | 5 | 1 | no (artifact extraction + language detection) |

**Zero of the 24 are expressible as the review's proposed row shape**
(`{host, userSel[], aiSel[], aiLabel, scroll, streamingSel}`). The two that come
closest — Cohere and Perplexity — both need a *second selector tier*, which the
flat row has no field for. Generously extending the schema to tiered rows plus
an optional per-role content selector would capture roughly **6 of 24**
(Cohere, Kagi, Meta AI, Mistral, Qwen, Venice), averaging ~32 lines each ≈ 190
lines, replaced by ~6 rows plus a ~40-line generic runner: **a net saving on
the order of 100 lines, not 800.** The review's premise does not survive
contact with the current file.

The reason is structural, not accidental. These extractors are reverse-engineered
against churning React/Tailwind/Svelte markup, and the dominant shape is a
*fallback cascade*: primary attribute selectors → class-pattern selectors →
geometry/sibling heuristics, with live-verification dates in the comments
(`extractPerplexity` `:1211` "re-verified live (2026-07) — the old answer-container
wrappers no longer exist at all"; `extractDeepSeek` `:1240` "hashed, per-deploy
class … we identify a user turn by *absence* of `.ds-markdown`"). A data table
that could express cascades, attribute-vs-class role detection, per-role content
narrowing, and text-vs-markdown extraction is a DSL. It would be code, written
in JSON, with no syntax highlighting, no `node --check`, no debugger, and no
place to put the dated comments that are currently the single most valuable thing
in those function bodies.

The most recent significant extraction change proves the point in the other
direction. `extractClaudeFull()` + `runClaudeFullSweep()` (`:767-875`,
**~110 lines**) exist because claude.ai renders long chats as a TanStack Virtual
list, so only the messages near the viewport are mounted (CHANGELOG, Unreleased:
"Claude exports could silently cut off long conversations"). The fix is a
scroll-sweep with a `[data-index]`-keyed dedupe map, a longest-capture-wins rule,
a 500-step circuit breaker, an 11s budget tuned to `background.js`'s 15s batch
timeout, and a `finally` that restores scroll position. That landed on the
*best-supported* platform in the product. No table row expresses it.

### How many places key off per-platform knowledge?

Verified today by diffing the lists programmatically:

| Place | Shape | State |
|---|---|---|
| `manifest.json` `content_scripts[0].matches` | 33 patterns | the de-facto source of truth |
| `detectSite()` (`content.js:496`) | 24-branch `if` chain | in sync with manifest |
| `extractMessages()` switch (`content.js:2346`) | 24 `case`s | in sync |
| `isStreaming()` (`content.js:2257`) | 9 platform branches + generic fallback | partial by design |
| `scrollToLoadAll()` (`content.js:2208`) | hard-coded `['chatgpt','gemini','aistudio']` | partial by design |
| `findScrollContainer()` (`content.js:2195`) | 4-selector `??` chain with platform comments | implicit |
| `MESSAGE_ANCHORS` / `MESSAGE_TO_MD` (`:601`, `:999`) | 3-platform object maps | in sync |
| `DEBUG_SELECTOR_CHECKLIST` (`:3180`) | flat selector list | drifts silently, harmless |
| `background.js` `SUPPORTED_HOSTS` (`:660`) | 30 hosts | **missing `duck.ai`, `www.duck.ai`, `chat.qwen.ai`** → no active icon there |
| `popup.js` `CHIP_HOSTS` (`:175`) | 30 hosts | **missing `www.copilot.com`, `www.meta.ai`, `arena.ai`, `chat.qwen.ai`; contains phantom `phind.com`** |
| `bookmarklet/src/inkpour-bookmarklet.js` (`:169-212`) | ChatGPT + Claude only | deliberately scoped, hand-copied selectors |
| `test/fixtures/` | 21 files for 24 platforms | **no fixture for Copilot, AI Studio, Kagi** |

The review's "host lists drift in four places" finding is **still true, with
different contents than it reported** — `phind.com` is gone from the manifest and
`background.js` but still live in `popup.js`; `www.meta.ai`/`arena.ai` were added
to `background.js` but not to `popup.js`; Qwen was added to the manifest and
`detectSite()` but to neither consumer. User-visible effect today: the toolbar
icon stays grey on Duck.ai and Qwen, and the popup says "not a supported page" on
Qwen and on `arena.ai` (the domain `lmarena.ai` now redirects to, per the comment
at `content.js:523`).

**This is the one bug class in this repo that has demonstrably and repeatedly
recurred.** And `background.js:270-278` already contains both the diagnosis and
the cure, in a comment written by a previous maintainer pass:

> reuse the exact match patterns from manifest.json's `content_scripts` entry
> (read via the manifest itself, not a separately maintained list) so this can't
> drift out of sync the way `SUPPORTED_HOSTS` below already has

It fixes the context menu that way and leaves `SUPPORTED_HOSTS` 400 lines below
untouched. The fix is `api.runtime.getManifest()`, not a new architecture.

### The no-build-step constraint, precisely

`DEVELOPING.md`: "no build step — every file under version control is exactly
the file the browser loads." Loading mechanisms are: `manifest.json`'s
`content_scripts[0].js` array (content script), `importScripts()` in
`background.js` (2 entries), and `<script src>` tags in `popup.html` (8),
`settings.html` (4), `history.html` (3), `print.html` (2).

Two consequences for the proposals:

- **One file per platform is mechanically possible but structurally expensive.**
  Extra content-script files go in the manifest array only — no HTML edits. But
  `src/content.js` is a single IIFE, and content scripts in the same isolated
  world share one global object with no module scope. Splitting means promoting
  `htmlToMarkdown`, `convertNode`, `sortByDOMOrder`, `registerCitation`,
  `isVisibleForExtraction`, `findScrollableAncestor`, `detectSite` and the
  mutable module state `_footnoteOffset` / `_footnotes` / `_resolveGeminiLinks` /
  `_claudeFullSweepPromise` to globals in that world. The external review's own
  finding **B5** is that module-level mutable extraction state already causes
  footnote corruption when two extractions overlap; globalizing it across 24
  files makes that worse, not better, and it deletes the IIFE boundary that is
  currently the only thing keeping 3,600 lines of symbols out of a shared
  namespace.
- **A data table is cheap to load** — one `sites.json` would need `fetch()` +
  `web_accessible_resources` from a content script, or more simply a
  `src/sites.js` declaring one global, added to the manifest array. The review is
  right that loading is not the obstacle here. The obstacle is that the table
  cannot hold the code.

### Why `src/extractors/` died, and what that teaches

`src/extractors/{chatgpt,claude,gemini,copilot,aistudio,index}.js`,
`src/exporters/`, `src/browser/` were added in a single commit — `cb1aaa2`,
2026-07-05, *"feat: cross-browser support (Chrome/Edge/Brave) + settings page"* —
and have not been touched since. `git log` shows exactly one commit for all three
directories. They are ES modules with `export` statements, loadable by nothing
this extension uses: not the content-script array, not `importScripts()`, not a
classic `<script>` tag.

So the honest answer to "why did it rot" is **not** "nobody circled back." It is
that **the split was never load-bearing for a single second**. It was written
alongside the real feature, in a module format the no-build-step constraint
cannot load, while the working code stayed in `content.js`. Both `AGENTS.md`
("Dead code warning") and `DEVELOPING.md` ("One trap worth knowing up front")
now carry a warning paragraph about them — the project pays documentation rent
on a refactor it never shipped.

The rule that follows is specific and applies to anything proposed here: **a
restructuring must be a cut-over, not a parallel structure.** If after the change
the old shape still works, the new shape is optional, and optional structure in
this repo has a 100% historical failure rate (n=1, but it is the only data point
there is).

### What the test suite would have to absorb

`test/run-jsdom.js` (5,538 lines, 543 tests) drives extraction through
`extractFromFixture()` (`:114`): it reads `test/fixtures/<platform>.html` into
JSDOM, stubs `chrome`/`browser`, sets `window.__inkpourTestHostname`, injects
**`CONTENT_JS` as one script element**, then sends a real
`{ action: 'extract' }` through the real `onMessage` listener. `loadContentScriptEnv()`
(`:184`) does the same and hands back the live `window` for the per-message-button
tests. There is no per-extractor unit harness; every platform assertion goes
through the production message protocol.

- **One file per platform:** the harness must concatenate N files in manifest
  order. Doable in ~5 lines — and it creates a *new* drift surface (test loader
  list vs. manifest list) of exactly the kind this ADR is complaining about.
- **Data table:** harness unchanged.
- **Status quo / registry (below):** harness unchanged.

## Decision

**Recommended: neither proposal. Reject one-file-per-platform. Reject
`src/sites.json`. Instead do three cheap, targeted things — (A) derive every
host list from the manifest, (B) delete the dead module tree, (C) consolidate
per-platform knowledge into one in-file `PLATFORMS` registry whose `extract` is
still a function.**

The reasoning in one paragraph: the only recurring, user-visible bug class this
repo actually has in this area is **host-list drift**, and it is caused by three
hand-maintained *lists*, not by one large *file*. Neither proposal is required to
fix it, and `background.js:278` already demonstrates the two-line fix. Meanwhile
the measurements say one proposal would create 24 files to relocate 47% of a file
while dissolving its IIFE into globals, and the other is premised on a template
uniformity that does not exist (0 of 24 extractors fit the proposed row; ~6 fit a
generously extended one). Both carry real regression risk against 1,560 lines of
selector logic whose correctness is only weakly guarded — the fixtures are static
saved pages, and three platforms have no fixture at all, so a green suite after a
migration would prove the refactor preserved *snapshot* behaviour, not live
behaviour. For a single maintainer plus AI agents, the binding constraint is not
file size (`grep "function extract" src/content.js` is instant and
`DEVELOPING.md` already documents that as the entry point) — it is the number of
places that must be edited in lockstep to add or change a platform. Today that is
six to eight. The registry takes it to one. Neither splitting nor tabulating does.

### (A) Derive host lists from the manifest — the actual bug fix

Replace `background.js`'s `SUPPORTED_HOSTS` (`:660`) and `popup.js`'s
`CHIP_HOSTS` (`:175`) with values computed from
`api.runtime.getManifest().content_scripts[0].matches`, parsing
`*://host/*` → `host`. `background.js` only needs the flat host set (for
`updateBadge()`), so it is a pure deletion of 30 literals. `popup.js` needs
host → display-name, so keep a `{ host: 'Display Name' }` map but assert at load
that its key set equals the manifest's — or better, source the display names from
the `PLATFORMS` registry in (C) and let `popup.js` receive them with the
extraction response it already gets.

This alone fixes the grey icon on Duck.ai/Qwen, the false "not a supported page"
on Qwen and `arena.ai`, and removes the phantom `phind.com` chip. **Do this
regardless of what is decided about the rest of this ADR.**

### (B) Delete `src/extractors/`, `src/exporters/`, `src/browser/`

346 lines of unloadable ES modules, plus the warning paragraphs they force
`AGENTS.md` and `DEVELOPING.md` to carry. Deleting them is the cheapest
maintainability win available in this repo and removes the trap that both docs
currently warn new contributors (and agents) about.

### (C) One `PLATFORMS` registry inside `src/content.js`

One object literal per platform, replacing the parallel per-platform structures
with a single source of truth, **in the same file, in the same IIFE, with
`extract` still a plain function**:

```js
const PLATFORMS = {
  claude: {
    label:      'Claude',
    match:      host => host.includes('claude.ai'),
    extract:    extractClaudeFull,          // a function, not a selector row
    streaming:  ['[aria-label*="Stop"]', '[data-testid="stop-response-button"]',
                 '.streaming-indicator, [class*="streaming"]'],
    scrollToLoad: false,                    // extractClaudeFull sweeps itself
    anchors:    { sel: '…', anchor: el => el },      // was MESSAGE_ANCHORS
    messageToMarkdown: claudeMessageToMarkdown,      // was MESSAGE_TO_MD
    debugSelectors: ['[data-testid="user-message"]', '.font-claude-response'],
  },
  // …23 more
};
```

This is not a new idea in this codebase — it is the shape the codebase has
already converged on twice, under
`planning/adr-per-message-share-buttons.md`: `MESSAGE_ANCHORS` (`:601`) and
`MESSAGE_TO_MD` (`:999`) are already exactly this, for 3 platforms. (C) finishes
what those started instead of inventing a third pattern.

What collapses into it: `detectSite()`'s 24-branch `if` chain, `extractMessages()`'s
24-case `switch`, `isStreaming()`'s 9 platform branches (the generic fallback
stays), `scrollToLoadAll()`'s hard-coded allow-list, `MESSAGE_ANCHORS`,
`MESSAGE_TO_MD`, and the per-platform half of `DEBUG_SELECTOR_CHECKLIST`. What
does **not** change: every `extract<Platform>()` body, byte for byte.

Net effect on "add a new platform": today it is `manifest.json` + `detectSite()`
+ the switch + (maybe) `isStreaming()` + `background.js` + `popup.js` + a fixture
+ tests. After (A) + (C) it is `manifest.json` + one `PLATFORMS` entry + the
extractor function + a fixture. That is the entire maintainability case, and it
is achieved with zero new files and zero changes to how anything loads.

### Why the two proposals lose

**One file per platform.** It relocates 47% of `content.js` into 24 files,
leaves a 1,900-line `content.js`, and requires dissolving the IIFE so that ~8
shared helpers and 4 pieces of mutable extraction state become globals in the
content-script world — directly aggravating review finding B5 (overlapping
extractions corrupting `_footnoteOffset`). It adds a manifest-array ordering
dependency and a second ordered list in the test harness. It makes
cross-platform refactors (every one of the three `htmlToMarkdown` signature
changes in this file's history) a 24-file diff. And it buys nothing against any
bug class on record: selector rot is fixed inside one function body either way,
and host-list drift is a list problem that this does not touch. The one real
benefit — smaller files to open — is already served by `grep` and by the
`DEVELOPING.md` pointer.

**`src/sites.json` + a parameterized runner.** Its premise is measurably wrong on
current `main`: 0 of 24 extractors fit the proposed row, ~6 fit a tiered
extension of it, and the realistic saving is ~100 lines rather than ~800 — before
counting the new schema, the runner, and the per-platform escape hatches. What it
would actually produce is a two-tier system where 6 platforms live in JSON and 18
live in code, so "where is Mistral handled" gains an answer-depends step instead
of losing one. And it converts the fallback cascades and dated live-verification
comments — the highest-value content in those function bodies — into either lost
information or JSON strings with no comment syntax. The review's *other*
architectural recommendations are good and are not rejected here: the single
export pipeline (its strongest finding, the root cause of S2/S3/B3/B8) and the
`utils.js` split into `md.js`/`ooxml.js`/`zip.js`/`import.js` are both
worth doing and both out of scope for this ADR — `utils.js` is a flat set of pure
globals already consumed through explicit `<script>`/`importScripts` lists, with
no IIFE to dissolve, which makes it a genuinely easier and safer split than
`content.js`.

**Do nothing at all** also loses, but only narrowly: it leaves the drift bug
shipping on two platforms today, and leaves 346 lines of documented trap in the
tree. (A) and (B) are small enough that declining them is harder to justify than
doing them.

### If we do this — migration sketch

Four phases, each independently shippable and independently revertable. Phases 1
and 2 are worth doing even if phase 3 is never started.

**Phase 1 — host lists (XS, ~half a day).** Derive `background.js`'s
`SUPPORTED_HOSTS` and `popup.js`'s host set from
`runtime.getManifest().content_scripts[0].matches`. Add one JSDOM test asserting
that the manifest's host set, `detectSite()`'s recognized hosts, and the popup's
host set are identical — the test is the actual deliverable; the code change is
the easy part. Verify the icon turns active on Duck.ai and Qwen.

**Phase 2 — delete dead code (XS, ~an hour).** `git rm -r src/extractors
src/exporters src/browser`; drop the warning paragraphs from `AGENTS.md` and
`DEVELOPING.md`; confirm `scripts/release.sh`'s deny-list zip and the
`release.sh`-as-truth test still pass.

**Phase 3 — the registry (M, ~2 days, done in strict order).** The ordering is
the risk control: each step must leave `npm test` at 543/543 green with **no
assertion edits**, which is the acceptance criterion for every step.
  1. Add `PLATFORMS` with `label` + `match` only; rewrite `detectSite()` to
     iterate it. Order matters — the `googlesearch` entry must keep its
     `pathname === '/search'` guard and the `copilot`/`lmarena` entries their
     multi-domain `includes()` semantics. Delete the `if` chain.
  2. Add `extract`; rewrite `extractMessages()`'s switch as
     `await PLATFORMS[site]?.extract?.()`. Keep `extractGeneric()` as the
     fallback exactly as-is.
  3. Fold in `anchors` / `messageToMarkdown`; delete `MESSAGE_ANCHORS` and
     `MESSAGE_TO_MD` (3 platforms, already in this shape — the cheapest step).
  4. Fold in `streaming` (array of selectors) and `scrollToLoad` (boolean);
     rewrite `isStreaming()` as "check this platform's selectors, else the
     generic visible-stop-button fallback", preserving the generic branch's
     `getComputedStyle` visibility check verbatim. While here, fix review
     finding B10 by applying that same visibility check to the per-platform
     branches — this is the one behaviour change permitted in phase 3, and it
     gets its own test and its own commit.
  5. Fold in `debugSelectors`; have `DEBUG_SELECTOR_CHECKLIST` be computed from
     the registry plus a short list of cross-platform generics.

**Phase 4 — close the fixture gaps (S, ~a day).** Add fixtures for Copilot, AI
Studio and Kagi so all 24 platforms have one, then add a test that fails when a
`PLATFORMS` key has no fixture. Without this, "543 green" after phase 3 is
quieter evidence than it looks.

Explicitly **not** in scope: touching any `extract<Platform>()` body, splitting
`content.js` into any number of files, introducing a selector table, and the
`utils.js` split (worth doing, separate ADR).

## Consequences

**Positive**

- Fixes a live, user-visible bug (grey icon / "unsupported page" on Duck.ai,
  Qwen, `arena.ai`) and makes the class structurally impossible to reintroduce,
  with a test that enforces it.
- Takes "add a platform" from six to eight coordinated edits down to two files.
- Removes 346 lines of dead code and the two documentation warnings that exist
  only to defend against it.
- Zero new files, zero changes to `manifest.json`'s script array, zero changes
  to any `<script>` tag, zero changes to `importScripts()`, zero changes to the
  test harness. The no-build-step constraint is not merely satisfied — it is not
  engaged at all.
- The IIFE boundary and the single-script test-injection model both survive
  intact.

**Negative / costs**

- `src/content.js` stays large and will keep growing. This ADR does not solve
  "the file is 3,600 lines"; it argues that file size is not the problem worth
  spending a risky refactor on right now.
- Phase 3 touches `detectSite()`, `extractMessages()` and `isStreaming()` — three
  functions on every export path. The mitigation is the step ordering plus the
  "543 green with no assertion edits" gate, but this is not zero risk, and the
  fixtures are static snapshots (review finding T5): a green suite proves the
  refactor preserved snapshot behaviour, not live behaviour. Manual live checks on
  ChatGPT, Claude and Gemini are mandatory before merging phase 3.
- The registry makes `content.js` *start* with ~24 configuration objects before
  the first extractor. Reading the file top-to-bottom gets slightly worse; finding
  one platform's full behaviour gets substantially better.
- Rejecting the split means this question will be asked again when the file
  reaches ~5,000 lines. If it is reopened, the right seam is by **concern**
  (extraction core / FAB / per-message decoration / debug + probe tooling — four
  files of roughly 400-900 lines each, following the ~53% of the file that is
  *not* per-platform), not by platform. Noting that here so the next pass does not
  start from the per-platform premise again.

**Neutral**

- The bookmarklet keeps its hand-copied ChatGPT/Claude selectors. A shared
  selector source for it is only worth building if the bookmarklet's scope ever
  grows beyond two platforms; at n=2 the parity test the review suggests is
  cheaper than the shared source.

## Open questions for the decider

1. Is "one file per platform" motivated by maintenance pain, or by `content.js`
   being unpleasant to open? If the latter, phase 3 plus the concern-based seam
   noted above addresses it more cheaply and with less risk.
2. Phase 3 is optional relative to phases 1 and 2. Ship 1+2 first and decide on 3
   afterwards?
3. Should the `utils.js` split (`md.js`/`ooxml.js`/`zip.js`/`import.js`) and the
   single export pipeline — the review's two strongest architectural findings,
   both deliberately out of scope here — get their own ADR before any of this?
