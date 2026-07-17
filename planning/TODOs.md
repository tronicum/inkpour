# Inkpour TODOs

Sourced from the Gemini (Google AI Mode) competitive-research chat, 2026-07-17
(`planning/googlesearch-inkpour-chat.md`). Engineering reference lives in
`planning/planning.md` — this file is for backlog items that don't belong there:
a real bug the export itself surfaced, product/roadmap ideas from that chat, and
a documentation action item for Stefan.

## Bug found via that export
- [ ] Google AI Mode extractor duplicates every turn: each exchange appears twice
  (once bled into the tail of the previous Gemini message alongside page furniture
  like `Show allCopiedCopyEditYou said: ...`, once again as its own proper turn).
  The chat's front matter says "20 messages" — really 10 unique turns. Also leaks
  "Share public link" / feedback-widget / related-search-result blocks into message
  bodies. Likely a boundary issue in the geometry-based turn detection added this
  week (`extractGoogleAiModeTurnsByGeometry()` in `src/content.js`) — the Y-position
  cut between one answer and the next isn't tight enough, or duplicate a11y nodes are
  both passing the visibility check.

## Product/roadmap ideas from competitive research (2026-07)
Feature gaps vs YourAIScroll (closest multi-platform competitor — closed-source,
$4.49/mo, paywalls Notion sync/batch export/PDF-DOCX):
- [ ] Notion export: BYO integration token + target page ID in settings, client-side
  `fetch` to the Notion Blocks API (`api.notion.com/v1/blocks/{page_id}/children`) —
  no backend needed. (The chat's own suggested endpoint was garbled — use Notion's
  real API docs when building this.)
- [ ] Obsidian-flavor markdown toggle: Dataview-friendly front matter keys (e.g.
  `type: ai-chat`) layered on the existing YAML/tags support; maybe `[[wikilink]]`s.
- [ ] Direct-to-vault saving via File System Access API (`showDirectoryPicker()`) —
  Chrome-only, Firefox won't implement it, so feature-detect and fall back to the
  existing Downloads-subfolder setting there.
- [ ] ChatGPT Canvas export (non-linear UI, needs its own extraction rules).
- [ ] Claude Artifacts: extract as structured blocks alongside the chat, not as
  plain code.
- [ ] Batch export: pick multiple conversations from a platform's history list →
  one ZIP.
- [ ] Confirm temporary/incognito chats export cleanly (should already work, since
  extraction is DOM-based) — if so, worth calling out as a feature, not just an idea.

Already shipped, no action needed: DOCX, citation footnotes, YAML front matter +
Obsidian tags, Downloads subfolder, filename sanitization. Obsidian vault path
integration is already tracked in `planning.md` → Next ideas.

## Positioning notes
- Angle: free, open-source, local-first, bring-your-own-API-key — directly
  undercuts YourAIScroll's paywalled Notion sync / batch export / PDF-DOCX.
- Competitors mentioned: YourAIScroll (multi-platform + KB sync), Pactify
  (ChatGPT-only, high fidelity), Tactiq (voice transcripts), SaveGPT/ChatGPT
  Exporter (single-site, low-maintenance), Gumloop/n8n (API automation — different
  category, our existing webhook integration already covers that niche).
- Their critique of multi-site tools ("breaks when sites change UI") is really an
  argument for keeping the JSDOM fixture suite growing and selectors re-verified —
  which is exactly what this session's extractor work was.

## UX: settings page save button is below the fold (found 2026-07-17)
Stefan noticed you have to scroll past 4 sections (Language, Export, Integrations,
Advanced — 17 fields total) to reach the single `#saveBtn` at the bottom of
`settings.html`, and it's easy to change something and navigate away without saving.
`settings.js` builds one `prefs` object from all field values and does a single
`storage.local.set` on the button's click handler — nothing field-specific stops a
per-field autosave.

Options, roughly cheapest → most complete:
- [ ] **Sticky save bar** (quick win): `.save-row { position: sticky; bottom: 0; }`
  with a background + top border/blur so it's always visible while scrolling.
  Keeps the existing explicit-save model, ~5 min change, zero behavior risk.
- [ ] **Autosave** (removes the problem entirely, and is the standard pattern for
  browser extension options pages — most don't have a save button at all): move the
  body of the existing click handler into a `save()` function, call it from a
  `change` listener on every field (checkboxes/selects fire cleanly on `change`;
  text fields like filename template, subfolder, webhook URL, gist tags should
  debounce ~400-500ms on `input` so it doesn't fire per keystroke). Keep the
  `#saveStatus` "Saved" toast for feedback. Can keep the button too, just make it
  redundant instead of load-bearing — lower risk than removing it outright.
- [ ] **Collapsible sections** (`<details>`/accordion per `<section>`, collapsed by
  default except whichever the user came in on): shortens the page and improves
  scannability, but doesn't by itself fix "forgot to save" — pair with one of the
  two above, don't treat it as a substitute.

Recommendation: do autosave + keep the sticky bar as the confirmation toast's home
(cheap, and removes the whole bug class rather than just making the button easier
to reach). Accordion sections are a nice-to-have, not required to fix this.

## Docs (Stefan's own action item, not code)
- [ ] Add a "Workflows: exporting to knowledge bases" section to the README:
  Obsidian (drag-and-drop, or point the Downloads-subfolder setting at the vault),
  and Notion once that export path ships.
