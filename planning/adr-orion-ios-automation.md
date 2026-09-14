# ADR: Orion-for-iOS test automation via local iOS Simulator

- **Status:** Proposed (blocked pending confirmation of a Simulator-installable Orion build — see Consequences)
- **Date:** 2026-09-14
- **Deciders:** Inkpour maintainers
- **Related:** `playwright.config.js` (comments on why Orion/macOS has no Playwright project), `test/helpers/extension.js` (Chromium-only fixture), `planning/TODOs.md` → Batch 15 (Orion macOS documented as manual-test-only), `DEVELOPING.md` → Orion notes

## Context

Inkpour's e2e coverage today is Chromium-only: Playwright's
`chromium.launchPersistentContext` with `--load-extension` (see
`test/helpers/extension.js`). Firefox was removed because Playwright cannot
open `moz-extension://` pages, and Orion (macOS) has never had an automated
project because it is not a Chromium, Firefox, or Playwright-WebKit channel —
there is no CDP or Playwright automation hook into it at all
(`playwright.config.js`, "Orion (macOS)" comment block). Orion verification is
currently a manual checklist on a real Mac.

Kagi also ships **Orion for iOS/iPadOS** ([App Store / orionbrowser.com](https://orionbrowser.com/)),
a WebKit-based browser that is — per Kagi's own docs — the first iOS browser
with preliminary support for **Chrome and Firefox WebExtensions**, installed
"one-click" from the Chrome Web Store or Firefox AMO inside the browser itself
([Kagi docs: iOS/iPadOS extensions](https://help.kagi.com/orion/browser-extensions/ios-ipados-extensions.html)).
Notably this is **not** the Safari Web Extension model (no Xcode-converted
native app wrapper, no folder side-load like Chrome's `--load-extension`):
Kagi ported the WebExtensions API surface onto WebKit themselves. Coverage is
~70% of the API surface and explicitly labeled beta
([Kagi technical docs](https://help.kagi.com/orion/misc/technical.html)), with
additional Apple-imposed limitations on iOS. Whether Inkpour's specific API
usage (MV3 service worker, `downloads`, `contextMenus`, `commands`,
`storage.local`, clipboard) is inside that 70% on iOS is **unverified** — the
same caveat `DEVELOPING.md` already records for macOS Orion applies more
strongly on iOS.

The question: can we build a **local, on-demand** (developer Mac, not CI)
automated smoke suite for Orion iOS using the iOS Simulator?

Two facts frame the answer:

1. **There is no remote-debugging protocol to hook into.** No CDP, no
   WebDriver BiDi, no Playwright channel. Playwright has zero iOS support of
   any kind. The only automation surface Apple offers is
   **XCUITest/WebDriverAgent** — accessibility-tree-level UI automation (tap,
   type, swipe, read labels). Appium's XCUITest driver is the standard
   toolchain wrapping it
   ([appium-xcuitest-driver](https://github.com/appium/appium-xcuitest-driver)).
2. **Getting Orion into a Simulator is the hard part.** App Store IPAs are
   device-arch builds signed for real hardware; they **do not install into the
   iOS Simulator**. Appium's `app` capability for a Simulator requires a
   `.app`/`.app.zip` **built for the simulator SDK**
   ([Appium XCUITest docs](https://appium.readthedocs.io/en/latest/en/drivers/ios-xcuitest/)).
   Kagi runs a public **TestFlight beta** for Orion iOS
   ([TestFlight link](https://testflight.apple.com/join/Ezjp0k4z)), but
   TestFlight likewise installs only on physical devices, not Simulators.
   No public evidence was found that Kagi distributes a simulator-compatible
   `.app` bundle. **This is unconfirmed either way** — it needs to be asked of
   Kagi directly (orionfeedback.org or support) before any build work starts.

## Decision

Adopt the following, in order:

1. **Gate everything on the build-availability question.** Before writing any
   automation code, verify whether a Simulator-installable Orion build exists:
   ask Kagi (support / orionfeedback.org) whether they can share a
   simulator-SDK `.app` for testing purposes, and check whether any published
   artifact is simulator-arch (`lipo -info` / `file` on the binary; a device
   IPA will not boot in a Simulator regardless of tooling).
2. **If a simulator build is obtainable:** build a **thin smoke suite** using
   **Appium + the XCUITest driver**, run **locally on demand only** (never
   CI). Tests drive Orion's native UI via accessibility identifiers/labels —
   tap the extensions UI, type into the address bar, tap the Inkpour toolbar
   button — because there is no `page.evaluate`, no `chrome-extension://`
   navigation, and no service-worker handle available through XCUITest.
3. **Scope the suite to installation + surface-level flow assertions only.**
   Extraction/formatting correctness stays in the existing jsdom unit tests
   (`test/run-jsdom.js`) and the Chromium Playwright e2e suite. The iOS suite
   asserts, roughly:
   - Orion launches in the Simulator and can navigate to a fixture page.
   - Inkpour can be installed via Orion's extension-install flow (or is
     pre-provisioned, if Orion exposes any mechanism for that — unknown).
   - The extension appears in Orion's extensions list / toolbar.
   - Tapping the toolbar icon opens the popup.
   - A basic export tap-through completes without error UI (e.g. Copy MD →
     verify via a paste field, since asserting on downloaded files in a
     Simulator sandbox is awkward but possible via `simctl` container access).
   It does **not** assert Markdown fidelity, DOCX structure, selector
   correctness per platform, etc.
4. **If no simulator build is obtainable (the likely case):** do **not**
   pursue physical-device automation as a substitute for now (signing,
   provisioning, and per-developer device state make it a poor fit for a
   side-project extension), and fall back to a **manual QA checklist for
   Orion iOS**, mirroring the existing manual macOS Orion procedure in
   `README.md`/`DEVELOPING.md`. Revisit if Kagi provides a build path.

### Proposed layout (only created once step 1 unblocks)

```
test/orion-ios/
  README.md            # local-only setup: Xcode + Simulator runtime, Appium 2.x,
                       # `appium driver install xcuitest`, where to put Orion.app,
                       # explicit "not run in CI" statement and why
  wdio.conf.js         # or appium capabilities JSON: platformName iOS,
                       # appium:automationName XCUITest,
                       # appium:app -> local path to simulator-built Orion.app,
                       # appium:deviceName/platformVersion pinned loosely
  smoke.spec.js        # the assertions from Decision point 3
  fixtures/            # reuse test/fixtures via a tiny static server the
                       # Simulator can reach (http://127.0.0.1 works from sims)
```

Keep it out of `playwright.config.js` entirely; add an npm script like
`test:orion-ios` that fails fast with a clear message when Xcode/Appium/
Orion.app are missing.

## Consequences

**Primary risk / current blocker (stated plainly):** as of 2026-09 there is no
confirmed way to get Orion iOS into a Simulator. App Store and TestFlight
distributions are device-only; only Kagi can provide a simulator-SDK build,
and nothing found publicly says they do. Until that is answered, this ADR's
automation plan is a design on paper and the fallback (manual checklist) is
the operative decision.

If unblocked:

- **Positive:** first automated signal on the only mobile browser that runs
  our extension; catches "extension won't install / popup won't open on iOS"
  regressions that no other suite can see; local-on-demand keeps CI untouched.
- **Negative / costs:**
  - New heavyweight local prerequisites: Xcode (~10+ GB), an iOS Simulator
    runtime, Appium 2.x + XCUITest driver, plus a Kagi-provided Orion build
    that must be manually refreshed — it will drift from the App Store
    release.
  - XCUITest tests are brittle by nature: they depend on Orion's UI
    accessibility labels, which Kagi can change in any release without
    notice; there is no API contract.
  - Orion's iOS WebExtensions support is itself beta at ~70% API coverage —
    failures may be Orion limitations rather than Inkpour bugs, so triage
    burden is real (same caveat as macOS Orion in `DEVELOPING.md`, amplified).
  - The extension-install step may require network access to the Chrome Web
    Store/AMO from inside the test, and possibly a signed-in state — flaky
    territory; needs a spike before committing to it in the suite.
  - Zero reuse of the Playwright harness: no shared fixtures, no
    `extensionId`, no `popupPage`. This is a separate small codebase to
    maintain.
- **Neutral:** the jsdom unit suite remains the source of truth for
  extraction/formatting; this suite never duplicates it.

## Alternatives Considered

1. **Playwright WebKit project** — rejected. Playwright's WebKit is a custom
   desktop build with no extension support and no iOS; it cannot launch or
   attach to Orion on any platform (already documented in
   `playwright.config.js`).
2. **CDP / remote debugging into Orion iOS** — rejected. No such protocol is
   exposed; Safari's remote Web Inspector protocol is not available for
   driving Orion's extension runtime, and Orion publishes no automation
   endpoint.
3. **Appium on a physical iPhone/iPad** — deferred. Technically viable today
   (TestFlight build installs on devices), but requires WebDriverAgent
   signing with a developer account, a dedicated cabled device, and
   per-developer setup that is disproportionate for a smoke layer. Revisit
   only if the Simulator path is permanently closed and iOS coverage becomes
   a priority.
4. **XCUITest directly (Swift, no Appium)** — rejected. Cross-app UI testing
   of a third-party app from a bare XCUITest bundle is possible but means a
   Swift/Xcode project inside a JS repo, with all the same install blockers
   and none of Appium's JS ergonomics.
5. **Manual QA checklist for Orion iOS** (mirror of the macOS Orion
   procedure) — **accepted as the fallback and the interim decision** until
   the build-availability question is answered by Kagi.

## Verification checklist (to move Status forward)

- [ ] Ask Kagi whether a simulator-SDK Orion `.app` can be shared for testing.
- [ ] If yes: spike `xcrun simctl install booted Orion.app` + Appium
      `appium:app` launch; confirm Orion boots and the extension-install flow
      is reachable in a Simulator.
- [ ] Confirm Inkpour actually installs and runs in Orion iOS **manually on a
      real device first** (TestFlight/App Store Orion) — no point automating
      a flow that doesn't work by hand.
- [ ] Then create `test/orion-ios/` per the layout above and flip Status to
      Accepted.

## Sources

- [Kagi docs — Orion iOS/iPadOS Web Extension support](https://help.kagi.com/orion/browser-extensions/ios-ipados-extensions.html)
- [Kagi docs — Orion WebExtensions API support (technical)](https://help.kagi.com/orion/misc/technical.html)
- [Orion Browser by Kagi](https://orionbrowser.com/)
- [Orion Browser TestFlight beta](https://testflight.apple.com/join/Ezjp0k4z)
- [Appium XCUITest driver](https://github.com/appium/appium-xcuitest-driver)
- [Appium XCUITest docs — simulator app capability](https://appium.readthedocs.io/en/latest/en/drivers/ios-xcuitest/)
