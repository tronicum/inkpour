# ADR: Per-message "Copy as Markdown" buttons injected into the page

- **Status:** Accepted — verified working (2026-09-20) in real Chromium (not
  jsdom) against all three platforms, via a Playwright harness that
  intercepts network requests to serve local fixtures at the real hostnames
  (so `content_scripts` match patterns fire for real, with no login and no
  live-network flakiness). Real service worker, real shadow-DOM button click,
  real clipboard read, on ChatGPT/Claude/Gemini: 12/12 passed on each,
  4 anchors / 4 `data-inkpour-msg` / 4 hosts per site, no duplicates after a
  forced DOM mutation, zero console errors. The multi-day "button doesn't
  appear" investigation resolved to a single root cause: **the
  `perMessageCopyButtons` setting was simply never turned on** in the browser
  being tested — the code was correct throughout. jsdom suite: 473/473.
  Verification credit: a second Claude Code session ("Cowork") with real
  Chrome automation attached, collaborating via a small peer-to-peer file
  protocol (`agent-echochamber`) built during this same investigation. Their
  Playwright harness is intended to become `test/e2e/per-message.spec.js`.
- **Date:** 2026-09-18
- **Deciders:** Inkpour maintainers
- **Related:** `src/content.js` (`htmlToMarkdown`, `extractChatGPT`,
  `extractClaude`, `extractGemini`, `injectInPageButton`, `watchNavigation`,
  `showToast`, `isStreaming`, `findScrollContainer`), `settings.html` /
  `settings.js` (toggle conventions — `scrubLocalExports`, `generateTOC`),
  `src/settingsSync.js` (`SYNCABLE_SETTING_KEYS`), `src/redact.js`,
  `manifest.json` (`content_scripts.js`), `_locales/*/messages.json` (26 locales,
  key-parity test), `planning/adr-orion-ios-automation.md` (format reference)

## Context

Inkpour today offers exactly two in-page affordances, both **conversation-level**:
the floating FAB (`injectInPageButton()`, `src/content.js:2078`) with its
six-item menu, and the toolbar popup. Both operate on the whole chat —
`extractMessages()` → `buildMarkdown()` / `buildMarkdownInPage()`.

Google's own AI surfaces (and Claude's and ChatGPT's native UIs) put a small
share/copy affordance on **each individual message**. Users increasingly expect
that granularity: "give me *that one answer* as Markdown" is a different job
from "archive this conversation", and today it's served only by the host page's
own copy button — which yields the platform's own idea of Markdown, not
Inkpour's (no citation footnotes, no artifact/canvas code-fence extraction, no
consistent cross-platform shape).

The maintainer has already fixed three parameters:

1. **Action:** click copies that one message as Markdown to the clipboard.
   Nothing else — no dropdown, no per-message PDF/DOCX, no conversation export.
2. **Platform scope:** ChatGPT, Claude, Gemini only — the three "Full" support
   platforms, whose extractors are the best-maintained and whose fixtures exist.
3. **Default:** off. One new opt-in Settings toggle, built exactly like
   `scrubLocalExports`.

What remains — and what this ADR decides — is the *how*: where the button
attaches per platform, how new messages get one without duplicates, how it
stays visually isolated, how one message becomes Markdown, how the clipboard
write happens, how success is signalled, the exact setting/i18n wiring, and
what guardrails keep a 400-turn chat from janking.

Three facts from the codebase frame every decision below:

- **`htmlToMarkdown(element)` already takes a single DOM node.** Every extractor
  calls it per message (`src/content.js:64`). There is no array or document-level
  input format to work around.
- **`_footnoteOffset` is a module-global running total, reset only inside
  `extractMessages()` (`src/content.js:1972`).** Any code path that calls
  `htmlToMarkdown()` outside an extraction pass will silently inherit — and then
  advance — that counter. This is a real latent bug for this feature and is
  handled explicitly below.
- **`src/content.js` never reads `chrome.storage`.** Every setting it honours
  today (`_resolveGeminiLinks`, `src/content.js:636`) arrives as a field on the
  `{ action: 'extract' }` message from the popup (`src/content.js:2792`). This
  feature needs its setting *at page load*, before any message arrives, so it
  introduces the content script's first direct storage read.

### Non-goals (explicitly out of scope)

- A per-message dropdown or menu of any kind.
- Per-message PDF, DOCX, HTML, JSON, ZIP, Gist, Notion, or webhook.
- The ~15 experimental platforms (Copilot, Grok, Perplexity, DeepSeek, Meta AI,
  Mistral, HuggingChat, Poe, Qwen, NotebookLM, Kagi, Venice, LMArena,
  Character.AI, Cohere, Pi, Duck.ai, Z.ai, AI Studio, Google AI Mode).
- Any change to the existing floating FAB, its menu, the popup export flow, or
  `buildMarkdown()`.
- Per-message *selection* (multi-select + bulk export). Different feature.

## Decision

### 1. DOM injection strategy — standalone overlay, per-platform anchors

**Decided: a standalone injected element per message, positioned via CSS
against an anchor element the extractors already own. Not adoption of the
host page's native action row.**

The tempting option is to append our button into ChatGPT's own copy/regenerate
row so it looks native. Rejected, for three concrete reasons:

- **React/Angular reconciliation destroys foreign children.** ChatGPT's action
  row and Gemini's `<message-actions>` are framework-rendered. A re-render (new
  message, model switch, hover state, edit) can drop our node without any
  mutation we can distinguish from a legitimate one, producing
  "button vanished" bugs that are unreproducible on demand.
- **It triples the fragile-selector surface.** Adopting native rows means
  maintaining three *new* toolbar selectors on top of the three message
  selectors we already maintain. The overlay approach adds **zero new
  selectors** — it reuses the exact anchors `extractChatGPT()`,
  `extractClaude()` and `extractGemini()` already depend on, so any DOM change
  that breaks the button also breaks export, and gets fixed once.
- **Native rows are hover-revealed and inconsistent.** ChatGPT's user-turn
  actions and Claude's message actions only materialise on hover; on Gemini the
  row exists persistently. Our button's visibility would inherit three
  different behaviours we don't control.

The overlay: for each message we stamp the anchor with
`data-inkpour-msg="<id>"` and insert a shadow host as the anchor's **last
child**. One injected `<style>` (document-level, one per page) supplies:

```css
[data-inkpour-msg] { position: relative; }
```

Setting `position: relative` on an element whose computed position is `static`
is layout-neutral (it establishes a containing block and changes nothing else),
which is why this is safe to apply to a host page's own element. The PoC must
still guard it: if `getComputedStyle(anchor).position !== 'static'`, leave it
alone — it is already positioned and works as a containing block as-is.

The host itself is `position:absolute` at the anchor's top-right (see per-platform
placement), `opacity:0` by default, `opacity:1` on `[data-inkpour-msg]:hover`
and on `:focus-within` — so it is keyboard reachable and does not add permanent
visual noise.

**Per-platform anchors and placement** (the three genuinely differ):

| Platform | Anchor element | Why this one | Placement |
|---|---|---|---|
| **ChatGPT** | `turn.closest('article[data-testid^="conversation-turn-"]') ?? turn`, where `turn` is each `[data-message-author-role]` | `[data-message-author-role]` is an *inner* div; anchoring on it puts the overlay inside the prose column. The `article` is the block-level turn wrapper and spans the full turn width. **Verify the `article` selector live before coding** — if absent, the `?? turn` fallback is correct and harmless. | top-right, `top:4px; right:4px` |
| **Claude** | the `[data-testid="user-message"]` / `.font-claude-message` / `.font-claude-response` / `[data-testid="assistant-message"]` element itself | Claude's message elements are already block-level prose containers and the extractor enumerates exactly these. Do **not** climb to a `closest()` ancestor — Claude's wrapper classes are Tailwind-generated and unstable. | user turns are a rounded bubble: place **outside** at `top:2px; right:-30px` so the control never covers bubble text; assistant turns use `top:0; right:0` |
| **Gemini** | the `<user-query>` / `<model-response>` custom elements themselves | Custom element names are the single most stable selector of the three platforms — Angular component tags, not generated classes. Note `conversation-container` wraps a *turn pair*, not one message (see the comment at `src/content.js:1820`), so it is the wrong anchor here. | top-right, `top:6px; right:6px` — Gemini's own `<message-actions>` row sits at the message *bottom*, so there is no collision |

Because the anchors are exactly the extractors' selectors, the PoC must lift
them into three shared constants used by both the extractor and the injector,
rather than copy-pasting strings (see §9 touch points).

### 2. Detecting new messages — extend the existing observer, don't add a second

`src/content.js` has exactly one MutationObserver in the main path today —
`watchNavigation()` at `src/content.js:2306`, which watches `document.body`
with `{ subtree: false, childList: true }` purely as a URL-change tripwire, and
on change removes `#inkpour-root` and re-injects the FAB after 900ms.

**Decided:** keep that observer as the *navigation* tripwire and extend its
callback to also reset per-message state; add message-attachment as a second
responsibility of a single new `decorateMessages()` function driven by **one**
additional observer scoped to the chat scroll container. The reason the existing
observer cannot simply be widened: it is deliberately `subtree: false` on
`document.body` — widening it to `subtree: true` on body would fire on every
streamed token in the whole page, which is exactly the jank this ADR is meant to
avoid.

The design:

```
scheduleDecorate()            // rAF-coalesced, at most one decorate per frame
  └─ decorateMessages()       // idempotent, cheap, safe to call any number of times
```

- **Trigger 1 — load:** call `scheduleDecorate()` once from the existing
  bottom-of-file init block, right next to `injectInPageButton()`
  (`src/content.js:2320`).
- **Trigger 2 — mutations:** `new MutationObserver(scheduleDecorate)` observing
  `findScrollContainer()` (`src/content.js:1815` — already knows the right
  element for ChatGPT and Gemini) with `{ childList: true, subtree: true }`.
  `findScrollContainer()` falls back to `document.documentElement`; if it
  returns that for Claude, observe `document.body` with subtree — acceptable
  because `scheduleDecorate()` is rAF-coalesced and `decorateMessages()` is O(n)
  over a `querySelectorAll` of ~dozens of nodes.
- **Trigger 3 — SPA navigation:** inside the existing `watchNavigation()`
  callback, after `document.getElementById('inkpour-root')?.remove()`, also
  clear the decoration bookkeeping (`_decoratedIds.clear()`, detach the mutation
  observer, re-attach it after the same 900ms delay because the scroll container
  is a different element on the new route) and `scheduleDecorate()`.

**Duplicate prevention** is two-layer and deliberately belt-and-braces:

- A `data-inkpour-msg` attribute on the anchor — survives our own code being
  re-entered, and is what the CSS hooks onto.
- A `WeakSet` of decorated anchors — survives the host page *stripping* our
  attribute (React re-rendering an element's attributes is a real scenario).
  On each pass, an anchor in the WeakSet whose shadow host is no longer
  `anchor.contains(...)` is re-decorated; an anchor with both is skipped.

**Streaming:** skip the last message if `isStreaming()` (`src/content.js:1877` —
already implements all three platforms) returns true. Attaching mid-stream is
pointless (content is incomplete) and guarantees a mutation storm. The next
`scheduleDecorate()` after streaming ends picks it up.

### 3. Styling / isolation — one shadow root per button, not shared with the FAB

**Decided: each per-message button gets its own `attachShadow({ mode: 'open' })`
host. It does not share the FAB's shadow root.**

The FAB's shadow root lives inside `#inkpour-root`, a `position:fixed`
viewport-anchored element (`src/content.js:2083-2106`). A shadow root cannot
project content into arbitrary DOM positions — to sit at each message's corner,
each button must physically live inside (or absolutely positioned against) that
message's subtree. Sharing is not technically available, so the question is only
whether to use Shadow DOM at all.

Yes: the host pages are Tailwind-heavy and set aggressive `button`, `svg`, and
`*` rules. The FAB's proven recipe carries over verbatim —
`:host { all: initial; }` plus a `@media (prefers-color-scheme: dark)` block
(`src/content.js:2114`, `:2173`). Use the FAB's exact palette so the two
affordances read as one extension: `#5b5bd6` light / `#818cf8` dark.

Cost check: N shadow roots for N messages. A shadow root is a few hundred bytes
and a handful of style rules; 200 of them is immaterial next to the host page's
own component tree. To keep even that minimal, the `<style>` text is built once
into a module-level `CSSStyleSheet` and attached via `adoptedStyleSheets` where
supported (Chrome, Firefox 101+, Safari 16.4+), falling back to a cloned
`<style>` node — so the CSS is parsed once, not N times.

The single `[data-inkpour-msg] { position: relative }` rule goes in one
document-level `<style id="inkpour-msg-style">` injected once — it cannot live
in a shadow root because it targets a host-page element.

### 4. Single-message Markdown — a thin per-platform wrapper, plus a footnote fix

`htmlToMarkdown(element)` accepts a single DOM node, so it is directly
compatible. But calling it raw on a message element is **wrong** for all three
platforms, because each extractor does per-message pre-processing first:

- **ChatGPT** (`src/content.js:518-533`): narrows to
  `.markdown, [class*="prose"], .text-message`, **clones**, then extracts and
  removes Canvas blocks, appending their code as a fenced block.
- **Claude** (`src/content.js:552-588`): **clones**, extracts artifact code into
  a fenced block with language detection, then removes all `[class*="artifact"]`
  UI.
- **Gemini** (`src/content.js:687-699`): narrows to `div.query-content` (user)
  or `message-content` (model) to skip the "You said"/"Gemini said" chrome.

**Decided:** extract that per-message body out of each of the three extractors
into three named functions, and have both the extractor's `.map()` and the
button call them. One source of truth, zero drift, and the existing fixture
tests keep covering it because the extractor output is unchanged.

```js
function chatgptMessageToMarkdown(turn)   { /* body of the current .map() callback */ }
function claudeMessageToMarkdown(el)      { /* ditto */ }
function geminiMessageToMarkdown(el)      { /* ditto */ }
```

Each returns the message body Markdown as a string (the role label stays in the
extractor, which knows it from the anchor's attributes/tag).

**The footnote counter must be isolated.** `_footnoteOffset` is a module global
reset only in `extractMessages()` (`src/content.js:1972`). A per-message copy
that calls `htmlToMarkdown()` outside an extraction pass would (a) emit
footnotes numbered from wherever the last full export left off, and (b) advance
the counter, corrupting a subsequent export. Wrap every per-message copy:

```js
function copyOneMessageMarkdown(anchor, platform) {
  const saved = _footnoteOffset;
  _footnoteOffset = 0;
  try {
    return MESSAGE_TO_MD[platform](anchor);
  } finally {
    _footnoteOffset = saved;
  }
}
```

A single-message copy that cites sources therefore gets `[^1]`, `[^2]`, … and
its own trailing `**Sources:**` block — correct in isolation, which is what a
standalone paste needs.

**Output shape — bare body, no heading, no rule.** The copied text is the
message content only: no `## You` / `## Claude` heading, no `---` separator, no
`> Exported from …` line. `buildMarkdown()` and `buildMarkdownInPage()` are
**not** reused. Rationale: this mirrors what every platform's native copy button
produces, and it is what pastes cleanly into a note, an issue, or a doc. A user
who wants the framing wants a conversation export, which already exists.

**Redaction.** `scrubLocalExports`'s own Settings copy promises it covers
"both clipboard copies". A per-message copy is a local clipboard copy, so it
must honour the setting. `src/redact.js` is currently **not** in the content
script bundle (`manifest.json:150` lists only `src/content.js`). Add it:

```json
"js": ["src/redact.js", "src/content.js"]
```

`src/redact.js` declares plain globals with no side effects at load (same style
as `src/utils.js`), so this is safe. Then, when `scrubLocalExports` is on, pass
the string through `redactSecrets()` before the clipboard write. If the PoC
wants to defer this, it must instead say so in the toggle's description text —
silently breaking the redaction promise is not acceptable.

### 5. Clipboard — content-script `navigator.clipboard.writeText()`, with a fallback

**Decided: write directly from the content script.**

This is the path already proven in this codebase. The FAB's own "Copy MD" does
exactly `await navigator.clipboard.writeText(md)` from the content script
(`src/content.js:2272`) and ships across Chrome, Firefox, Edge, Safari and
Orion. The background-mediated route does not exist in the direction one might
assume: the `{ action: 'copyToClipboard' }` handler (`src/content.js:2765`)
delegates *into* the content script precisely because a service worker has no
DOM and no clipboard, and the popup's own document can lose focus. Routing a
content-script-originated copy out to the background and back would be strictly
worse.

(The Safari quirk in this codebase is about **downloads**, not clipboard:
Safari has no `browser.downloads`, so `background.js:13-23` sends
`{ action: 'safariDownload' }` to the content script for the `<a download>`
trick, handled at `src/content.js:2772`. Nothing in that path applies here —
this feature never downloads.)

Two hardening details:

- The click handler must call `writeText()` **synchronously within the user
  gesture** — build the Markdown first, then write; do not `await` anything
  before the clipboard call, or Safari/WebKit will reject on lost user
  activation.
- On rejection, fall back to the `document.execCommand('copy')` textarea trick
  (offscreen `<textarea>`, `select()`, `execCommand`, remove). Covers
  non-secure-context and focus-loss edge cases. If both fail, show the error
  toast.

### 6. Visual feedback — existing toast + a local icon swap

**Decided: both, reusing what exists.**

`showToast(text, variant)` (`src/content.js:2351`) is already a Shadow-DOM,
auto-dismissing (2.8s), variant-coloured toast used by the AI Mode probe. Call
`showToast(api.i18n.getMessage('contentMsgCopied'), 'success')` on success and
`showToast(msg, 'error')` on failure.

Additionally, swap the button's own glyph `⎘ → ✓` and hold `opacity:1` for
1200ms, then revert. This is the immediate, local acknowledgement that matters
when the pointer is at the message and the toast is in the far corner. Cheap
(one class toggle + `setTimeout`), no new machinery.

Do **not** reuse the FAB's `setStatus()` — it writes into the FAB menu's
`.status-msg` element, which is a different shadow root and usually not visible.

### 7. Settings wiring

**Setting key:** `perMessageCopyButtons` — boolean, default `false`.

**i18n keys** (four; add to **all 26** `_locales/*/messages.json` — a test
enforces identical key sets across locales, per `AGENTS.md`):

| Key | English |
|---|---|
| `settingsPerMessageCopyLabel` | `Copy button on each message` |
| `settingsPerMessageCopyDesc` | `Show a small button on every message in ChatGPT, Claude, and Gemini that copies just that one message as Markdown. Off by default. Only affects the three fully-supported platforms.` |
| `contentMsgCopyTitle` | `Copy this message as Markdown` (button `title` / `aria-label`) |
| `contentMsgCopied` | `Message copied as Markdown` (toast) |

**Location in `settings.html`:** the **Export** section
(`<details class="settings-section">` opened at `settings.html:253`), inserted
directly after the `generateTOC` field (`settings.html:300-309`) and before
`downloadSubfolder`. Markup copies the `scrubLocalExports` field verbatim
(`settings.html:447-456`):

```html
<div class="field">
  <div class="field-label">
    <strong id="lbl-perMessageCopyButtons" data-i18n="settingsPerMessageCopyLabel">Copy button on each message</strong>
    <span id="desc-perMessageCopyButtons" data-i18n="settingsPerMessageCopyDesc">…</span>
  </div>
  <label class="toggle">
    <input type="checkbox" id="perMessageCopyButtons" role="switch"
           aria-labelledby="lbl-perMessageCopyButtons"
           aria-describedby="desc-perMessageCopyButtons" />
    <div class="toggle-track"></div>
  </label>
</div>
```

**`settings.js` — four edits, matching `scrubLocalExports` exactly:**

1. `DEFAULTS` (`settings.js:75-96`): `perMessageCopyButtons: false,`
2. load (`settings.js:109-127`):
   `document.getElementById('perMessageCopyButtons').checked = prefs.perMessageCopyButtons;`
3. `save()`'s `prefs` object (`settings.js:248-270`):
   `perMessageCopyButtons: document.getElementById('perMessageCopyButtons').checked,`
4. the discrete-controls save-on-`change` id list (`settings.js:292-297`): add
   `'perMessageCopyButtons'`.

**`src/settingsSync.js`:** add `'perMessageCopyButtons'` to
`SYNCABLE_SETTING_KEYS` (`src/settingsSync.js:17-29`). It qualifies — a
non-sensitive UI/behaviour toggle, exactly the described category, no token or
path.

**`popup.js`:** add `perMessageCopyButtons: false` to its own DEFAULTS object
(`popup.js:~102`) so the popup's settings snapshot stays key-complete. The popup
does not otherwise use it.

**How `src/content.js` reads it — a new, deliberate storage read.** The content
script currently reads no storage at all; `_resolveGeminiLinks` piggybacks on
the extract message (`src/content.js:2792`). That pattern cannot work here,
because buttons must appear at page load with no popup interaction. Add, near
the top of the IIFE:

```js
let _perMessageCopy = false;

api.storage.local.get('inkpour_settings', (res) => {
  _perMessageCopy = !!(res?.inkpour_settings?.perMessageCopyButtons);
  if (_perMessageCopy) startMessageDecoration();
});

api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.inkpour_settings) return;
  const next = !!changes.inkpour_settings.newValue?.perMessageCopyButtons;
  if (next === _perMessageCopy) return;
  _perMessageCopy = next;
  next ? startMessageDecoration() : teardownMessageDecoration();
});
```

`storage.local` is the source of truth (`src/settingsSync.js` header: the sync
mirror is a convenience layer read by the settings/popup UI, never the
authority) — the content script reads **local only**, never `storage.sync`. The
`storage` permission is already granted (`manifest.json:21`). The
`onChanged` listener means toggling in Settings takes effect on open tabs
immediately, with no reload — which is the expected behaviour for a visual
toggle and makes it testable in one step.

`teardownMessageDecoration()` disconnects the observer, removes every
`[data-inkpour-msg]` host, strips the attribute, and clears the WeakSet/Set.

### 8. Performance and safety guardrails

The cost here is **not** the number of buttons — it is observer churn during
streaming. Concretely, for a 200-message chat: 200 shadow hosts is on the order
of a millisecond of work and a few hundred KB, invisible next to ChatGPT's own
component tree. **Viewport-lazy mounting (IntersectionObserver) is therefore
explicitly rejected as unnecessary complexity for this PoC.**

What is required:

1. **rAF coalescing.** `scheduleDecorate()` sets a pending flag and a single
   `requestAnimationFrame`; the observer may fire hundreds of times per second
   during streaming and must cause at most one `decorateMessages()` per frame.
2. **Idempotent, cheap decorate pass.** One `querySelectorAll` per platform
   selector, then a `data-inkpour-msg` / WeakSet check per node. No layout reads
   (`getBoundingClientRect`, `offsetTop`) anywhere in the pass — placement is
   pure CSS, which is a further reason for the overlay strategy over any
   JS-positioned alternative. The one `getComputedStyle` call (the
   `position: static` guard, §1) happens **once per anchor at first decoration
   only**, never on re-passes.
3. **Skip the streaming message** via `isStreaming()` (§2).
4. **Hard cap.** `MAX_DECORATED = 400`. Past it, stop decorating and
   `console.warn` once. A chat longer than 400 turns is pathological; the cap is
   a circuit breaker, not a feature.
5. **Never throw into the host page.** The whole decorate pass is wrapped in
   `try/catch` with a single `console.warn` — a selector change on ChatGPT must
   degrade to "no buttons", never to a broken page or a broken export.
6. **`{ passive: true }` / no global listeners.** Hover reveal is CSS-only; the
   only listener added is one `click` per button. No document-level mousemove.

## Consequences

**Positive**

- Serves the single most common granular ask ("just that answer") with Inkpour's
  own Markdown — citation footnotes, Canvas/artifact code fences, consistent
  shape — rather than the platform's.
- Zero new fragile selectors: the feature rides the same three anchors export
  already depends on, so DOM breakage is one fix, not two.
- Refactoring the three per-message bodies into named functions is a net
  structural improvement to `src/content.js` and is covered by existing fixtures.
- Off by default, per-tab live toggle, fully removable at runtime — the blast
  radius for users who don't want it is nil.
- Fixes a latent `_footnoteOffset` leak that would have bitten any future
  out-of-extraction `htmlToMarkdown()` caller.

**Negative / costs**

- **First DOM mutation of the host page's own elements.** Everything Inkpour
  does today is read-only plus one fixed-position overlay. This adds an
  attribute and a child node to elements a third-party framework owns. The
  `position: static` guard and the WeakSet re-attach logic are mitigations, not
  guarantees — a sufficiently aggressive re-render could still flicker.
- **New maintenance surface tied to three moving targets.** ChatGPT's
  `article[data-testid^="conversation-turn-"]` in particular is a *new*
  dependency (the extractor doesn't use it today), which is why the fallback to
  the message element itself is mandatory.
- **26 locale files × 4 new keys.** Mechanical, but the key-parity test will
  fail loudly until all are present.
- **A content script that reads storage and listens to `onChanged`** is new
  behaviour to keep in mind for anyone reasoning about content-script lifecycle.
- Adding `src/redact.js` to the content bundle grows every supported site's
  content-script payload slightly (it loads on all ~25 matched sites, not just
  the three).
- The JSDOM fixtures (`test/fixtures/chatgpt.html` etc.) are hand-written
  minimal structures, not saved real pages — they can test the decorate/dedupe
  logic and the Markdown output, but **cannot** validate the real anchors. Live
  manual verification on all three platforms is mandatory before shipping.

**Neutral**

- The floating FAB, popup, and `buildMarkdown()` are untouched. This is purely
  additive.

## Alternatives Considered

1. **Inject into the platform's native action row** (next to ChatGPT's own copy
   button). *Rejected* — framework reconciliation drops foreign children
   unpredictably, it triples the fragile-selector count, and the three
   platforms' rows have three different visibility behaviours. Reconsider only
   if the overlay proves visually unacceptable on a specific platform, and then
   only for that platform.
2. **Shared floating-button shadow root with JS-positioned buttons.**
   *Rejected* — not technically available (a shadow root can't project to
   arbitrary DOM positions) and the JS alternative (absolutely-positioned nodes
   in a single overlay layer, repositioned on scroll/resize) means continuous
   `getBoundingClientRect()` work, i.e. exactly the jank §8 exists to prevent.
3. **A single delegated document-level click listener + CSS-only pseudo-element
   buttons** (no injected nodes). *Rejected* — `::after` pseudo-elements aren't
   focusable or accessible, can't carry an `aria-label`, and can't show the
   copied-state swap. Accessibility alone rules it out.
4. **Reuse `buildMarkdownInPage()` for the single-message output**, yielding
   `## Claude\n\n…\n\n---`. *Rejected* — a per-message copy should paste as
   content, not as an export fragment. The heading is conversation-export
   framing.
5. **Route the clipboard write through `background.js`.** *Rejected* — a service
   worker has no clipboard; the existing `copyToClipboard` handler proves the
   flow already runs the other way (background → content script).
6. **Pass the setting in via the popup's message, like `resolveGeminiLinks`.**
   *Rejected* — buttons must exist before the user ever opens the popup. Direct
   `storage.local` read is the only workable source.
7. **AI turns only** (matching Google's own affordance most closely).
   *Rejected* in favour of **both user and AI turns.** Re-copying one's own
   prompt — to reuse, to file as a snippet, to paste into another model — is a
   first-class use case, and the extractors already enumerate user turns with
   identical reliability, so the marginal cost is one extra selector in an array
   we already have. The reverse (adding user turns later) would mean revisiting
   all three platforms. If the maintainer disagrees after seeing it, restricting
   to AI turns is a one-line filter in `MESSAGE_ANCHORS`.
8. **Viewport-lazy mounting via IntersectionObserver.** *Rejected* — see §8;
   the per-button cost is negligible and the observer churn (which lazy mounting
   does not fix) is the actual risk. rAF coalescing addresses the real problem
   with a fraction of the code.
9. **Extend `watchNavigation()`'s existing observer to `subtree: true` on
   `document.body`** instead of adding a scoped one. *Rejected* — that observer
   is deliberately `subtree: false`; widening it would fire on every streamed
   token across the entire page and would also change navigation-detection
   behaviour as a side effect.

## Implementation plan — exact touch points

**`manifest.json`**
- `content_scripts[0].js` → `["src/redact.js", "src/content.js"]`.

**`src/content.js`** (all inside the existing IIFE)
- **New, near the extractors (~line 505, before `extractChatGPT`):** a
  `MESSAGE_ANCHORS` map, single source of truth for the selectors:
  ```js
  const MESSAGE_ANCHORS = {
    chatgpt: { sel: '[data-message-author-role]',
               anchor: el => el.closest('article[data-testid^="conversation-turn-"]') ?? el },
    claude:  { sel: '[data-testid="user-message"], .font-claude-message:not(#markdown-artifact), ' +
                    '.font-claude-response:not(#markdown-artifact), [data-testid="assistant-message"]',
               anchor: el => el },
    gemini:  { sel: 'user-query, model-response', anchor: el => el },
  };
  ```
- **Refactor (no behaviour change):** lift the `.map()` callback bodies of
  `extractChatGPT` (`:515-534`), `extractClaude` (`:552-589`) and
  `extractGemini` (`:687-700`) into `chatgptMessageToMarkdown(el)`,
  `claudeMessageToMarkdown(el)`, `geminiMessageToMarkdown(el)`; call them from
  the extractors. `npm test` must stay green with no assertion changes — that is
  the refactor's acceptance criterion.
- **New:** `copyOneMessageMarkdown(el, platform)` — the `_footnoteOffset`
  save/reset/restore wrapper from §4, plus `redactSecrets()` when
  `_scrubLocalExports` is on.
- **New section after `injectInPageButton()` (~line 2302):**
  `startMessageDecoration()`, `teardownMessageDecoration()`,
  `scheduleDecorate()`, `decorateMessages()`, `makeMessageButton(anchor, platform)`,
  `ensureMsgStyleTag()`, plus module-level `_msgObserver`, `_decorated` (WeakSet),
  `_decoratedCount`, `_rafPending`.
- **Edit `watchNavigation()` (`:2306-2317`):** in the URL-changed branch, also
  `teardownMessageDecoration()` and re-`startMessageDecoration()` inside the
  existing 900ms `setTimeout`, guarded by `_perMessageCopy`.
- **New, top of IIFE (after `const api = …`, `:21`):** `_perMessageCopy`,
  `_scrubLocalExports`, the `storage.local.get` bootstrap and the
  `storage.onChanged` listener from §7.
- **Test hooks (`:2340-2347`):** export `decorateMessages`,
  `copyOneMessageMarkdown`, and `MESSAGE_ANCHORS` on `window.__inkpour*` under
  the existing `__inkpourTestHostname` guard.

**`settings.html`** — one `.field` block after the `generateTOC` field
(`:300-309`), inside the Export `<details>` (`:253`).

**`settings.js`** — `DEFAULTS` (`:75`), load (`:109`), `save()` prefs (`:248`),
discrete-controls id list (`:292`).

**`src/settingsSync.js`** — add `'perMessageCopyButtons'` to
`SYNCABLE_SETTING_KEYS` (`:17`).

**`popup.js`** — add `perMessageCopyButtons: false` to DEFAULTS (`:~102`).

**`_locales/*/messages.json`** — the four keys from §7 in all 26 locales.

**`test/run-jsdom.js`** — new assertions:
- `decorateMessages()` on each of the three fixtures attaches exactly one host
  per message, and a second call attaches none.
- Stripping `data-inkpour-msg` from an anchor causes re-decoration (WeakSet
  path), and the host count stays 1.
- `copyOneMessageMarkdown()` on a citation-bearing message numbers footnotes
  from `[^1]`, and `_footnoteOffset` is unchanged afterwards (run a full
  `extractMessages()` before and after and assert identical output).
- `teardownMessageDecoration()` leaves zero `[data-inkpour-msg]` in the DOM.

**`AGENTS.md` / `CHANGELOG.md`** — one line each; the `src/content.js` bullet
should mention per-message decoration alongside the floating button.

## Addendum (2026-09-18) — maintainer PoC feedback, follow-up PR

The maintainer tested the PoC from PR #31 live and gave two pieces of
feedback, implemented in a follow-up PR (`feat/per-message-copy-buttons-v2`,
builds on PR #31 rather than replacing it):

### A. Button placement moved to the bottom, near each platform's native
   action row

The original placement (§1 above) put the button at a fixed top corner on
every platform. Feedback: it read as disconnected from where each platform's
own message actions (thumbs up/down, copy, regenerate) actually sit — which
on all three platforms is the **bottom** of the assistant/model turn, not the
top.

This is a pure CSS repositioning change — the standalone-overlay decision in
§1 is unchanged, and the button is still **not** inserted into any platform's
own action row (that alternative is still rejected for the reasons in §1/
Alternative 1).

`placementKeyFor()` now returns six keys instead of four — `chatgpt-user` /
`chatgpt-assistant`, `claude-user` / `claude-assistant`, `gemini-user` /
`gemini-assistant` — since only assistant/model turns have a native row to
anchor near:

| Platform | Assistant/model placement | Reasoning | User placement (unchanged in spirit) |
|---|---|---|---|
| ChatGPT | `bottom: 4px; right: 4px` | The copy/regenerate/thumbs row renders under the assistant's prose, inside the same `article[data-testid^="conversation-turn-"]` wrapper `MESSAGE_ANCHORS.chatgpt` already anchors on — that wrapper exists specifically because it spans the full turn including the trailing action row. | `top: 4px; right: 4px` — no persistent action row on user turns (only a hover-only inline edit icon). |
| Claude | `bottom: 0; right: 0` | The assistant's copy/retry/thumbs row renders directly below `.font-claude-response`, the exact element `MESSAGE_ANCHORS.claude` anchors assistant turns on. | `top: 2px; right: -30px` — unchanged; user turns are a free-floating bubble with no action row, kept outside the bubble so the button never covers prompt text. |
| Gemini | `bottom: 6px; right: 6px` | `<message-actions>` (thumbs/copy/share) is documented in the existing `extractGemini()` comment to sit at the bottom of each `<model-response>` — this is exactly why the original top-right placement was already collision-free; moving to bottom-right just puts the two controls next to each other instead of at opposite corners. | `top: 6px; right: 6px` — unchanged; `<user-query>` has no action row. |

No live-browser access was available for this change either — same caveat as
the original PoC (see Status above and the Verification checklist below,
which still applies).

### B. Google AI Mode (4th platform) — investigated, not added

Task: check whether Google AI Mode (`detectSite() === 'googlesearch'`, i.e.
`google.com/search?udm=50`) has a stable-enough DOM anchor for a per-message
button, following the same `MESSAGE_ANCHORS` pattern as the other three
platforms.

**Conclusion: no — deliberately not added.** `extractGoogleAiModeTurnsByGeometry()`
(`src/content.js`, "Google AI Mode: geometry-based turn extraction" section)
exists precisely because this platform has no stable per-message container to
anchor on at all:

- The **user** turn does have one plausible anchor — the accessible heading
  `[role="heading"][aria-level="2"]` each turn renders as (chosen there
  specifically for being an a11y attribute Google has real reason to keep,
  unlike a styling class hash).
- The **assistant answer**, however, has **no single DOM element** that
  contains it. The extractor collects it by scanning `body *`, filtering by
  on-screen Y-band position (`getBoundingClientRect` between the heading's
  bottom and the next turn's top), explicitly rejecting X-position (sidebar)
  and any element that spills past the band — and then clones the surviving
  fragments into a synthetic `wrapper` div that exists only for that one
  extraction call. There is no persistent "this is turn N's answer" element
  in the live page to attach `data-inkpour-msg` / a shadow host to.

Anchoring a button only on the user-turn heading (skipping the assistant
side) was considered and rejected: it would be a materially different,
lesser feature than what exists on the other three platforms (where both
user and assistant turns get a button — see §9, Alternative 7), for the one
platform whose extraction is already flagged EXPERIMENTAL and whose selectors
have already gone stale once (2026-07, per the comment above
`extractGoogleAiModeTurnsByGeometry()`). Forcing a partial, asymmetric
implementation to check a box was judged worse than skipping it and revisiting
if Google AI Mode's markup ever stabilizes around a real per-turn container
(unlikely to happen without Google shipping one — this isn't something Inkpour
can create by picking a different selector).

No `MESSAGE_ANCHORS.googlesearch` / `MESSAGE_TO_MD.googlesearch` /
`googleAiModeMessageToMarkdown()` were added, and no new tests were added for
this platform's per-message buttons. The existing full-conversation export
for Google AI Mode (`extractGoogleAiModeTurnsByGeometry()`) is completely
unaffected.

## Verification checklist (to move Status to Accepted)

- [ ] Confirm live on chatgpt.com that
      `article[data-testid^="conversation-turn-"]` still wraps each
      `[data-message-author-role]` (Settings → Debug mode → Copy debug info is
      the fastest route). If not, drop to the `?? turn` fallback and re-tune the
      offset.
- [ ] Confirm on claude.ai that overlaying at `right:-30px` on a user bubble
      doesn't land under the viewport edge or Claude's own hover actions.
- [ ] Confirm on gemini.google.com that the overlay doesn't collide with
      `<message-actions>` or the source-chip row.
- [ ] Verify clipboard write succeeds in Chrome, Firefox, and Safari/Orion
      (Safari is the one that punishes a lost user gesture — §5).
- [ ] Verify toggling the setting affects an already-open tab with no reload,
      both directions.
- [ ] `npm test` green, including the unchanged extractor assertions after the
      §4 refactor.
- [ ] Locale key-parity test green across all 26 locales.
