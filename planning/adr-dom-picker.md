# ADR: DOM picker ("slurp this part") debug feature

Status: Proposed. Context: Gemini share links (`share.gemini.google/<id>`) were added as a host of the
existing `gemini` extractor. The shared page's DOM is unverified (it could not be fetched from the
authoring sandbox), so selectors may need adjusting. Extraction breakage is currently diagnosed via
"Copy debug info" (skeleton only, no text), which cannot say *which* node the user wants.

## Decision
Add a Debug-mode "Pick element" tool in `src/content.js`, started from the popup (like `#probeAiModeBtn`).

1. Overlay: on start, inject a fixed highlight box; `mousemove` outlines the element under the cursor
   (`elementFromPoint`, ignoring the overlay); arrow Up/Down walks to parent/child; click selects, Esc cancels.
   Capture-phase listeners with `preventDefault`/`stopPropagation` so the page does not react.
2. Output (copied to clipboard, on explicit user action only): a stable selector path (tag, classes, safe
   attributes, `jsname`, `role`; same safety filter as `buildDebugReport`), the selector match count, the
   Markdown produced by `htmlToMarkdown` for that node, and the privacy-safe skeleton of its subtree.
   Raw text is only included if the user ticks "include content"; default is character counts.
3. Optional "Export this part": run the picked node through `htmlToMarkdown`/`buildMarkdown` as a one-message export.
4. DevTools integration: `chrome.devtools` panels need an extra manifest key and are not available in
   Safari, so v1 stays in-page. Later option: a devtools page that uses `$0` (the Elements selection) via
   `inspectedWindow.eval` to feed the same report builder.

## Alternatives
- DevTools panel only: Safari lacks support; requires devtools open. Deferred.
- Right-click context menu on element: no hover/ancestor navigation. Rejected.

## Consequences
Users can report exact nodes without maintainer reproduction. Risks: pointer-event capture bugs on
shadow DOM (use `composedPath()`), privacy (mitigated by counts-by-default). Needs JSDOM tests for selector
generation and a fixture; the overlay itself is covered manually. Requires i18n keys in all 26 locales.
