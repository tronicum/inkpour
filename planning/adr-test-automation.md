# ADR: Test automation: hosted CI, nightly Firefox, macOS

- **Status:** Proposed
- **Date:** 2026-10-02
- **Deciders:** Inkpour maintainers
- **Related:** `playwright.config.js`, `test/helpers/extension.js`, `planning/adr-orion-ios-automation.md`, `planning/TODOs.md` (Batch 15, Batch 16), PR #41 (CI runs the JSDOM suite)

## Context

State of automation, checked against `main`, `dev` and the open PRs on 2026-10-02:

- `main` has no CI job that runs `npm test`. The only `npm` call in `.github/` is `npm install` inside the e2e job, which is gated to the weekly schedule, `workflow_dispatch`, or an `[e2e]` commit message.
- **PR #41 (`ci/run-jsdom-suite`, unmerged)** adds a `jsdom-tests` job (`npm ci && npm test`) on every push and PR, sets `permissions: contents: read`, pins actions by SHA, and pins `web-ext`/`chrome-webstore-upload-cli`. It also fixes the e2e content-script readiness wait.
- The JSDOM suite is 473 tests (472 pass in a shallow clone). The one failure is `every "## [x.y.z]" heading is either Unreleased or a real git tag` (`test/run-jsdom.js`): it runs `git tag -l`, which succeeds in a shallow clone, so the check does not skip and reports every tag-less heading. A default `actions/checkout` checks out depth 1 without tags, so the new `jsdom-tests` job is likely to hit this too. Not confirmed: the PR's Checks tab was not readable.
- Playwright e2e is Chromium-only (4 specs). Firefox was removed in 2026-07: Playwright's Firefox cannot load `moz-extension://` pages (playwright/playwright#7297).
- Safari and Orion are manual-only. A Linux Orion smoke scaffold exists on the PR #41 branch (`docker/orion-linux-smoke/`), never built or run.
- `dev` already contains share-link capture (#35) and N-up grid detection (#36); `main` does not.

GitHub-hosted macOS runners (GitHub docs, fetched 2026-10-02):
- Standard runners are free and unlimited on public repositories. Labels: `macos-latest`/`macos-14`/`macos-15`/`macos-26` (arm64, 3 cores, 7 GB) and `macos-15-intel`/`macos-26-intel` (4 cores, 14 GB). inkpour is public.
- Larger runners are billed even on public repos: 12-core x64 at $0.077/min, 5-core M2 Pro (arm64) at $0.102/min. A $50 to $100 budget buys roughly 490 to 980 minutes of the M2 Pro runner.

## Decision

Three tiers, cheapest first:

1. **GitHub-hosted (free):** ubuntu for `npm test`, `web-ext lint` and Chromium e2e; `macos-latest` and `macos-15-intel` for the Safari compile check and the Safari spike, triggered by `workflow_dispatch`/schedule at first.
2. **Local nightly box:** Firefox e2e (Selenium + geckodriver + WebDriver BiDi `webExtension.install`, `{type: "path"}`), triggered by cron or a systemd timer, not a registered runner.
3. **Self-hosted macOS runner:** only if the hosted runners prove insufficient (for example, unattended "Allow Unsigned Extensions" cannot be set up there).

Not now: k8s/ARC, Hetzner runners, the Orion Docker harness beyond the Flatpak-sandbox spike. Nothing may run on the Scaleway Nextcloud.

## Phases

### Phase 0: Land and finish what exists
- [ ] **XS** Review and merge PR #41 into `dev` (it targets the CI gap).
- [ ] **XS** Make the changelog/tag test robust to shallow clones (skip when `git rev-parse --is-shallow-repository` prints `true`), and/or set `fetch-depth: 0` in the `jsdom-tests` job. Check PR #41's Checks tab first to see whether it is actually red.
- [ ] **XS** Refresh the stale "318 tests" in `AGENTS.md` and `DEVELOPING.md` (still 318 on `dev` and on PR #41's branch).
- [ ] **S** Add `web-ext lint` to CI (Firefox manifest problems: `gecko.id`, `strict_min_version`, combined `background.service_worker` + `scripts`).
- [ ] **S** Fixture freshness: record a capture date per fixture, warn when older than N days.

### Phase 1: Nightly Firefox e2e (local)
- [ ] **S** Spike: install the unpacked extension via BiDi, open the popup, run one extraction against a local fixture. Go/no-go.
- [ ] **M** Port only the extraction and popup specs to the Firefox runner.
- [ ] **S** Nightly trigger on the local box: `git pull` on `dev`, `npm test` plus the Firefox suite, report to GitHub with a narrowly scoped token.

Caveats (from an independent review; the cited sources are in that review, not re-verified here): Firefox 141+ for clean errors on unsigned installs; the `playwright.config.js` comment says BiDi `webExtension.install` needs Firefox 138+, the review says it shipped in 137 (check before editing the comment); geckodriver/Selenium version pairing unverified; `moz-extension://` UUIDs are random per profile, so open the popup via the toolbar or read the UUID pref; fixture serving needs a local HTTP server or test-only `matches`.

### Phase 2: macOS (hosted first)
- [ ] **S** `workflow_dispatch` job on `macos-latest` (arm64) and `macos-15-intel`: `xcodebuild` of `safari/Inkpour-Safari` plus the converter as a compile check.
- [ ] **S** Spike: does the extension load and run under `safaridriver`'s automation windows on a hosted runner? Can "Allow Unsigned Extensions" be set unattended? Unverified either way; assume no until proven.
- [ ] **L (only if the spike passes)** Safari e2e via safaridriver or XCUITest.
- [ ] **S (only if the spike fails)** Decide: self-hosted Mac, or a paid larger runner within the stated $50 to $100 budget.

### Phase 3: Reporting and safety
- [ ] **S** One issue per nightly job (fixed label, comment if open, create if not, close on the next green run), replacing the weekly `curl` issue in `notify-failure`.
- [ ] **XS** Flake policy: `retries: 1` on live and nightly jobs only, never on JSDOM; pass-on-retry shown in the job summary.
- [ ] **XS** Artifacts: traces and screenshots on failure only, 7 to 14 days; never upload unscrubbed live-page HTML.
- [ ] **S** Public-repo runner hardening for any self-hosted runner: fork-PR approval set to "Require approval for all external contributors"; no `pull_request`/`pull_request_target` triggers on self-hosted runners; ephemeral runners; network-isolated from other machines.
- [ ] **M (optional)** Public share-link canary. Low value: it proves less than it seems, and logged-in canaries would need stored credentials, which are ruled out on a public repo.

## Open decisions
1. OS and uptime of the local Firefox box.
2. Whether hosted macOS (free) is enough, or a self-hosted Mac / paid runner is wanted after the Safari spike.
3. Who files issues: `gh` in the cloud sandbox is not authenticated, so issues are filed by the owner or with a scoped token on the owner's machine.
4. Branch/PR flow: this file lives on `docs/test-automation-concept` (local, off `dev`); `TODOs.md` is not edited until PR #41 merges, because it already adds a "Batch 17" there (a new batch from this ADR should be "Batch 18").
