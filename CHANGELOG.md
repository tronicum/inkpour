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
- Renamed "Copy HTML" to "Copy to clipboard" and moved it directly under
  the HTML option in that dropdown, so it reads as the clipboard version
  of the HTML export rather than an unrelated action.

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
