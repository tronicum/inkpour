# Persona: architect

Focus
- Module boundaries and duplication between `src/content.js` and `src/utils.js`.
- Accidental use of the dead code in `src/extractors/`, `src/exporters/`, `src/browser/`
  (see the dead-code warning in AGENTS.md): edits there change nothing.
- Direct `chrome.*` / `browser.*` calls instead of the `api` shim.
- Growth of the `src/content.js` IIFE: new per-site logic that should follow the existing
  `extract<Platform>()` pattern instead of inventing a new one.
- Changes that quietly alter a shared builder (`buildMarkdown`, `buildFilename`, ...) used by
  popup.js and background.js.

Do not comment on: style, naming, test coverage, documentation wording, security, performance.
