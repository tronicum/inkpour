# Changelog

All notable changes to Inkpour are documented here, one section per released
version (matching `manifest.json`'s `version` field and the `vX.Y.Z.W` git
tag). Loosely follows [Keep a Changelog](https://keepachangelog.com/).

This file is the single source of truth for "what's new" release-note text:
Batch 10 (automated store publishing, see `planning/TODOs.md`) will read the
section matching the tag being published and pass it as the release notes /
"recent changes" text for the Firefox (AMO) and Chrome Web Store listings.
**Keep each entry short and user-facing** — this is what an end user reviewing
an update sees, not an engineering changelog. When cutting a release, add a
new section here in the same commit as the version bump.

## [Unreleased]

### Added
- "Copy Text" export in the format picker: copies the conversation as plain
  text with all Markdown syntax stripped — no `**bold**`, `#` headings, code
  fences, or `[link](url)` markup — for pasting into plain email, SMS, or any
  field that doesn't render Markdown.
- Mobile bookmarklet (`bookmarklet/`): a standalone `javascript:` bookmarklet
  for mobile Safari (iOS) and Android Chrome, which can't install the
  WebExtension at all. Works on ChatGPT and Claude only, and copies the
  visible conversation to the clipboard as Markdown (falling back to a
  manual copy-from-overlay when the browser blocks the automatic clipboard
  write). No PDF/HTML/JSON/DOCX/ZIP export, no settings, no scroll-to-load —
  see `bookmarklet/README.md` for install steps and full limitations.
- Popup now shows a short "What's new in vX.Y.Z.W" panel, sourced from this
  file, the first time it opens after an update — once per version, then
  never again for that version.
- New opt-in setting "Scrub secrets in local exports": redacts likely API
  keys, tokens, and email addresses from files you save or copy locally
  (Markdown, PDF, HTML, JSON, DOCX, ZIP, clipboard) — handy before sharing
  an export or dropping it into a synced folder. Off by default; the
  existing upload scrubbing for Gist/Notion/webhooks is unchanged.
- The "Generate table of contents" setting now also applies to PDF exports
  and the print/preview page, matching Markdown and HTML exports. Previously
  PDF output was unaffected by this setting despite the feature having
  shipped in 0.4.31.0 (#6).
- Settings now follow you across signed-in devices for a small set of
  non-sensitive preferences (default export format, table of contents,
  YAML front matter, etc.) via browser sync. Tokens, local file paths,
  and vault handles always stay local-only on each machine.

### Changed
- NotebookLM citations now export in the same `[^N]` footnote format used by
  Gemini, Perplexity, and Google AI Mode, with a `**Sources:**` block listing
  each one — instead of NotebookLM's own bare `[N]` list with no per-citation
  entry. NotebookLM's UI doesn't expose a source URL, so each footnote
  degrades to a plain "NotebookLM source N" label rather than a link, but no
  citation is dropped.

### Fixed
- Accessibility pass on the popup and Settings pages: the export-format menu
  is now fully keyboard-navigable (arrow keys, Home/End, Escape returns focus)
  and announces the selected format to screen readers; every Settings control
  and toggle switch now has a proper accessible name; toggles show a visible
  focus ring when tabbed to; export status messages are announced as they
  appear; and several low-contrast text colors (muted grey and amber warning
  text in light mode) were darkened to meet WCAG AA.
- Export filenames now handle edge cases that previously produced broken or
  invalid names: very long titles could exceed the 255-byte filesystem
  filename limit (the old 100-character cut counted UTF-16 units, so CJK or
  emoji-heavy titles blew past it) and could split an emoji or accented
  character in half at the cut point; titles matching Windows-reserved device
  names (CON, PRN, AUX, NUL, COM1–9, LPT1–9) produced files Windows refuses
  to create; emoji and decomposed accents (combining marks) in titles were
  stripped to dashes instead of being preserved; and a truncated name could
  end in a stray dash.

## [0.4.31.2] - 2026-09-14

### Added
- Chrome Web Store auto-submit wired into `release.yml`'s `publish-chrome`
  job — no extension code changed from 0.4.31.1. This release exists to
  exercise that pipeline end-to-end for the first time.

## [0.4.31.1] - 2026-09-14

### Fixed
- `release.yml`'s Firefox (AMO) submission step passed `--use-submission-api`
  to `web-ext sign`, a flag removed in web-ext v8+ (folded into default
  behavior) — v0.4.31.0's AMO auto-submit failed as a result. Dropped the
  flag and pinned `web-ext@10` to avoid the same drift again. No extension
  code changed from 0.4.31.0.

## [0.4.31.0] - 2026-09-14

### Added
- Table of contents for Markdown and HTML exports (closes #6): when
  "Generate table of contents" is enabled and a chat has 3+ user turns,
  a clickable "Contents" block is prepended listing each user question
  (short, plain-text label) linking down to that turn — mirroring
  ChatGPT's own in-chat conversation navigator. Skipped for short chats
  where a TOC would just be noise. PDF output is unaffected.
- Debug mode: a "Probe AI Mode" button that fills a test prompt into
  Google AI Mode and reports which page elements end up wrapping it —
  for diagnosing why extraction sometimes finds nothing there.
- Experimental export support for duck.ai (closes #10).

### Fixed
- DeepSeek export was broken after a site DOM redesign; extractor
  rewritten against the current markup (closes #9).
- Gemini's lazy-loaded long chats only captured part of the
  conversation on export; scroll-to-load now recognizes Gemini's
  scroll container (closes #8).
- The floating export button overlapped Google AI Mode's own Send
  button; given extra clearance on that surface only (closes #11).

## [0.4.30.1] - 2026-07-27

### Fixed
- Settings' "Import debug" and "PDF fuzzer" links were dead in every
  installed build — the release zip was accidentally excluding the whole
  `debug/` folder those pages live in. Fixed; personal test fixtures stay
  excluded as before.

## [0.4.30.0] - 2026-07-23

### Added
- Notion export — send a conversation straight to a Notion page (bring your
  own integration token + page ID).
- Direct-to-vault saving (Chrome/Edge) — write exports straight to a folder
  on disk instead of downloading, via a one-time folder picker.
- Batch export (ChatGPT + Claude) — tick several past conversations from
  the platform's own history sidebar and export them all as one ZIP.
  **Pending a live end-to-end test before this is fully verified.**

### Fixed
- ChatGPT Canvas code blocks now get a language tag on the code fence.
- Google AI Mode: fixed every turn appearing duplicated in exports.
- Footnote numbering no longer collides across messages in the same export.
- Missing `api.notion.com` permission needed for the new Notion export.

### Changed
- Settings now autosave (no more losing changes by navigating away before
  hitting Save).
- Settings page sections are now collapsible, for easier scanning.
- Context-menu export entries only appear on supported chat sites.
- Obsidian-flavored front matter now always includes a `type: ai-chat` key.
- The toolbar icon now turns green on supported AI chat sites, replacing
  the old small "ON" badge — much easier to spot at a glance.
- The popup's export buttons are now a compact picker: Copy MD and ZIP stay
  one click away as before, and every other format is chosen from a
  dropdown, then run with a separate Export button — picking a format no
  longer fires it immediately, so there's always a chance to change your
  mind before a Gist/Notion upload (or any other export) actually runs.
- Renamed "Copy HTML" to "Copy" and moved it directly under the HTML
  option in that dropdown, so it reads as the clipboard version of the
  HTML export rather than an unrelated action.
- The export dropdown's caret is now bigger and flips direction while
  open, and every option now shows a small icon (download / copy / upload)
  indicating where it goes, instead of a few options spelling that out
  in words.

## [0.4.28.1] - 2026-07-17
### Fixed
- Google AI Mode turn-duplication bug.
### Added
- Settings page autosave + sticky save bar.
### Docs
- README links to the published Firefox/Chrome store listings.

## [0.4.28.0] - 2026-07-17
### Fixed
- Verified and corrected several experimental extractors (Perplexity,
  NotebookLM, Venice); dropped Phind (site changed); added meta.ai/arena.ai
  domains.

## [0.4.27.4] - 2026-07-16
### Fixed
- Minor fixes from the PDF-import debug pass.

## [0.4.27.3] - 2026-07-16
### Fixed
- Small stability fixes.

## [0.4.27.2] - 2026-07-16
### Added
- Debug-mode PDF import: paste a printed/exported PDF of an AI chat back in
  through the import button.

## [0.4.27.1] - 2026-07-13
### Fixed
- A stale pending import no longer overrides a live, currently-open
  supported chat tab.

## [0.4.27.0] - 2026-07-12
### Added
- Clipboard-paste import — paste a copied chat transcript in and Inkpour
  reconstructs the conversation.
- Gist exports now include copy/share links.
### Fixed
- An i18n locale-override bug; a History-persistence bug.

## [0.4.26.1] - 2026-07-12
### Fixed
- Resolved an unresolved `__MSG_x__` placeholder appearing in release
  titles.

## [0.4.26.0] - 2026-07-12
### Added
- Full interface translation: 26 locales, with right-to-left layout support
  for Arabic/Persian.

## [0.4.25.0] - 2026-07-11
### Fixed
- Manifest cleanup (resolved leftover merge-conflict markers).

## [0.4.24.2] - 2026-07-11
### Fixed
- Replaced unsafe `innerHTML` assignments with safe DOM APIs; fixed the
  Perplexity, Mistral, Pi.ai, Character.AI, Venice, and lmarena extractors.

## [0.4.24.1] - 2026-07-11
### Fixed
- Release script housekeeping.

## [0.4.24.0] - 2026-07-07
### Added
- In-page scroll progress indicator during export.
- Obsidian vault path setting.
- NotebookLM inline citation numbers in exports.

## [0.4.23.4] - 2026-07-07
### Fixed
- Replaced an `innerHTML` assignment for the Gist URL with a safe DOM API;
  hardened history's stored Gist URL handling.

## [0.4.23.3] - 2026-07-07
### Fixed
- Firefox AMO manifest: corrected `data_collection_permissions` to
  `required: ["none"]` per spec.

## [0.4.23.2] - 2026-07-07
### Fixed
- Firefox AMO manifest: added required `data_collection_permissions` field.

## [0.4.23.1] - 2026-07-07
### Fixed
- Firefox AMO (Manifest V3) compliance: added the required
  `browser_specific_settings` Gecko ID.

## [0.4.2] - 2026-07-06
### Added
- Four new extractors: lmarena, Character.AI, Cohere, Pi.ai.
- Safari scaffold (manual Xcode build, not store-published).
- Fuzzy search in export history; parallel multi-format export; DOCX
  polish (nested lists, tables, hyperlinks); HTML export from the in-page
  floating button.
### Fixed
- Tracking parameters (UTM, gclid, fbclid, msclkid, …) are now stripped
  from the recorded source URL.
- Safari downloads polyfill for browsers without the native downloads API.

## [0.2.3] - 2026-07-05
### Added
- DOCX export, export history with search, GitHub Gist upload, webhook-on-
  export, a personal notes field, reading-time estimate, lifetime export
  stats.
- New extractors: z.ai, Google AI Search, Groq Playground.
- Smart export-title fallback; filename tokens (`{msgcount}`, `{words}`,
  `{time}`).

## [0.2.0] - 2026-07-05
### Added
- Initial public release (as "Babelfish Exporter", renamed to Inkpour
  shortly after). Cross-browser support (Chrome/Edge/Brave), settings page,
  Markdown/PDF/HTML export of AI chat conversations.
