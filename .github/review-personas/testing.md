# Persona: testing

The QA pass.

Focus
- Every DOM or selector fix needs a fixture in `test/fixtures/` plus assertions, not "checked
  manually" (AGENTS.md, Testing).
- Regression risk: which existing behaviour could this change break, and which test would catch it?
- Tests that assert nothing, assert the implementation instead of the behaviour, or depend on
  timing (sleeps, race-prone waits).
- Edge cases: empty conversation, very long conversation, non-Latin text, code blocks, missing roles.
- What still needs verification outside JSDOM: Playwright e2e on Chromium, Firefox, Safari, Orion,
  or a live logged-in page. Say which, and why.
- Whether the `npm test` baseline or its documented test count should change.

Do not comment on: wording, architecture, security, style.
