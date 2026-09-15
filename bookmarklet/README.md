# Inkpour mobile bookmarklet

A standalone `javascript:` bookmarklet that copies the visible conversation
on a supported AI chat page to your clipboard as Markdown — for browsers
that can't install the Inkpour WebExtension at all.

## Why this exists

Inkpour is a Manifest V3 WebExtension. Desktop Firefox, Chrome, Edge, and
Brave can install it; on macOS, [Orion](https://kagi.com/orion/) can too.
But **mobile Safari (iOS) and mobile Chrome (iOS/Android) cannot install
WebExtensions at all** — there's no extension store, no developer mode, no
loophole. Until this bookmarklet, those users had no way to use Inkpour on
their phone, period.

If you're on **Orion for iOS**, you don't need this — Orion runs the real
Inkpour extension directly (see the main [README](../README.md#supported-browsers)
for install steps). Use this bookmarklet only where a real extension isn't
an option.

## What it does (and deliberately does not do)

- Extracts the conversation currently rendered on screen for **ChatGPT**
  (`chatgpt.com` / `chat.openai.com`) and **Claude** (`claude.ai`) — nothing
  else, in v1.
- Converts it to Markdown and copies it to your clipboard, with a toast
  confirming success.
- If the clipboard write is blocked (mobile Safari restricts the async
  Clipboard API outside a trusted user gesture, and some hardened Chrome
  setups do too), it falls back to an on-screen `<textarea>` overlay with
  the Markdown pre-selected — tap **Copy** from the text-selection menu to
  finish the job in one more tap.
- It is **entirely self-contained**: one `javascript:` URI, no network
  requests, no `eval` of remote code, no `chrome.*`/`browser.*` extension
  APIs (mobile browsers don't expose those to a bookmarklet anyway).

Explicitly **out of scope** for this bookmarklet:

- No PDF, HTML, JSON, DOCX, or ZIP export — Markdown-to-clipboard only. No
  file downloads at all (mobile browsers make bookmarklet-triggered
  downloads unreliable, and it would blow past this tool's "small and
  reliable" goal).
- No settings, no export history, no YAML front matter, no table of
  contents, no Gist/Notion/webhook integrations.
- No platforms beyond ChatGPT and Claude.
- **No scroll-to-load handling.** It exports exactly what is currently in
  the DOM when you tap it — if you want the whole conversation, scroll
  through it first so everything has rendered, then tap the bookmarklet.

For everything above, install the real Inkpour extension on a browser that
supports it.

## Install on iOS Safari

Mobile Safari doesn't let you drag a link into your bookmarks bar the way
desktop browsers do, so you create an ordinary bookmark first and then
replace its URL with the bookmarklet code:

1. Open [`bookmarklet/dist/install.html`](./dist/install.html) (or any page)
   in Safari, tap the **Share** icon, and choose **Add Bookmark**. The page
   you bookmark doesn't matter — you're about to overwrite its URL.
2. Go to Safari's **Bookmarks** list (the open-book icon), tap **Edit**,
   then tap the bookmark you just created.
3. Change its **Title** to something recognizable, like `Inkpour: Copy MD`.
4. Tap the **URL** field, select all the existing text, delete it, and
   paste in the full bookmarklet code (the one long `javascript:...` line
   from `bookmarklet/dist/inkpour.bookmarklet.txt`, or copied straight off
   `install.html`).
5. Tap **Done**.
6. Open ChatGPT or Claude in Safari, scroll so the messages you want are on
   screen, tap the bookmark from your bookmarks list — the conversation is
   copied as Markdown (or the copy overlay appears).

## Install on Android Chrome

1. Open `bookmarklet/dist/install.html` (or any page) in Chrome, tap the
   star/bookmark icon in the address bar (or the &vellip; menu → **Add to
   bookmarks**).
2. Open Chrome's menu → **Bookmarks**, find the new entry, tap its
   three-dot menu, and choose **Edit**.
3. Change the **Name** to something recognizable, like `Inkpour: Copy MD`.
4. Clear the **URL** field and paste in the full bookmarklet code.
5. Save.
6. Open ChatGPT or Claude in Chrome, scroll so the messages you want are on
   screen, open your bookmarks, tap the entry — the conversation is copied
   as Markdown (or the copy overlay appears).

## Building it yourself

```bash
npm run build:bookmarklet
```

This runs `bookmarklet/build.js` (plain Node, no new dependencies) against
`bookmarklet/src/inkpour-bookmarklet.js` and writes:

- `bookmarklet/dist/inkpour.bookmarklet.txt` — the raw installable
  `javascript:...` URI, as one line.
- `bookmarklet/dist/install.html` — a page with a draggable bookmarklet
  link (for desktop testing) and the manual install steps above, with the
  code ready to copy.

The build step does light, conservative comment/whitespace stripping — it
is **not** a real minifier (correctness over byte count, per the project's
own constraints: no bundler, no new dependencies). See the comments in
`build.js` for exactly what it does and does not touch.

## Clipboard behavior — what was verified, what wasn't

- **Verified in this repo's test suite** (`npm test`, JSDOM-based): the
  extractor and Markdown builder produce correct output, and — because
  JSDOM has no Clipboard API at all — every test run exercises the
  overlay fallback path end-to-end. That confirms the fallback UI renders
  correctly and contains the right Markdown when the clipboard is
  unavailable.
- **Not verified on a real device**: whether `navigator.clipboard.writeText()`
  actually succeeds from a bookmarklet tap on real iOS Safari / Android
  Chrome. It's expected to work in most cases — a bookmarklet tap is a
  genuine user gesture, which is what the Clipboard API's permission model
  requires — but mobile Safari in particular has a history of being
  stricter than desktop browsers about what counts as "trusted enough,"
  and behavior can vary by iOS version and site (some sites' own script
  environment can interfere with a bookmarklet's execution context). If
  you hit the copy-overlay fallback on a device where you expected the
  automatic clipboard write to succeed, that's the fallback doing its job,
  not a bug — please report it anyway so we can tell how common it is.

## Code organization

- `bookmarklet/src/inkpour-bookmarklet.js` — the readable source. Every
  function is declared at plain top level (no wrapping IIFE) so
  `test/run-jsdom.js` can `vm.runInThisContext()` it and call the
  extraction/markdown functions directly, the same pattern already used by
  `src/utils.js` and `src/vaultHandle.js`. The file never calls its own
  entry point (`runInkpourBookmarklet()`) at load time — `build.js` appends
  that call when it produces the installable URI — so merely loading this
  file in a test has no side effects.
- `bookmarklet/build.js` — the build script described above.
- `bookmarklet/dist/` — generated output (not hand-edited; regenerate with
  `npm run build:bookmarklet`).

This source is a **deliberately duplicated, adapted subset** of
`src/content.js`'s `htmlToMarkdown`/extractor logic, not a shared module.
A `javascript:` bookmarklet has different constraints (no bundler, no
`browser.*`/`chrome.*` APIs, must be a single dependency-free file) than
the extension's content script, so coupling the two would make both harder
to maintain for a marginal reduction in duplicated code. If the extension's
extraction logic changes in a way that would also improve the bookmarklet
(e.g. a new ChatGPT/Claude DOM selector), port the change over by hand.
