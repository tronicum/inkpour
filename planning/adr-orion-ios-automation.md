# ADR: Orion-for-iOS test automation via local iOS Simulator

- **Status:** Proposed (blocked pending confirmation of a Simulator-installable Orion build — see Consequences)
- **Date:** 2026-09-14
- **Deciders:** Inkpour maintainers
- **Related:** `playwright.config.js` (comments on why Orion/macOS has no Playwright project), `test/helpers/extension.js` (Chromium-only fixture), `planning/TODOs.md` → Batch 15 (Orion macOS documented as manual-test-only), `DEVELOPING.md` → Orion notes
- **See also:** the [2026-10 addendum](#addendum-2026-10-why-the-background-script-does-nothing-on-orion-ios) at the end of this file — it answers the "does Inkpour actually run on Orion iOS at all?" question this ADR's verification checklist parks, and supersedes the "unverified" hedge in Context below for the background-script half of it.

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

---

# Addendum (2026-10): why the background script does nothing on Orion iOS

- **Status:** Accepted — root cause identified and fixed; residual iOS API
  gaps remain unverified (see "What is still unknown" below)
- **Date:** 2026-10-11
- **Related:** `manifest.json` → `background`, `background.js` → the
  `typeof importScripts` guard and the "Background health beacon" block,
  `popup.js` → `getBackgroundHealth()`/`formatBackgroundHealth()`,
  `popup.html` → `#bgHealthBtn`/`#bgHealthPanel`

This addendum lives in the same file as the automation ADR above rather than
in its own, because it answers the question that ADR's verification checklist
already parked ("Confirm Inkpour actually installs and runs in Orion iOS") and
because splitting Orion-iOS findings across files helps nobody.

## Context

A maintainer reported from hands-on use on a real iPhone that Inkpour's
background script "does not work" in Orion for iOS. That is a complete
failure, not a degraded one — not "context menus are missing", but nothing
background-side running at all.

## The root cause (documented, not inferred)

Two facts combine:

1. **Orion always prefers `background.scripts` over
   `background.service_worker`** when a manifest declares both. This is
   documented as a bug on Kagi's own tracker — orionfeedback.org #13760,
   *"Incorrect background environment preference in extensions"*, filed with a
   reproducible demo extension: *"When extensions declare both
   `background.scripts` and `background.service_worker`, Orion always favors
   `background.scripts`, even tho chrome extensions are supposed to favor
   `background.service_worker`."* (Filed against Orion macOS 1.0.6/WebKit
   624.1.7, and the same engine-level WebExtensions port backs iOS.)
   Corroborating signal from Kagi's own iOS release notes: Orion 1.3.0 lists
   *"Essential Browser/Chrome variable not given in background and option
   pages"* — i.e. Orion iOS runs background **pages**.
2. **`importScripts()` does not exist in a background page.** It is a
   `WorkerGlobalScope` API. Firefox MV3 and Orion both run the background
   entry point as a non-persistent event/background page, where it is simply
   undefined.

`manifest.json` declared both keys, and `background.js` opened with two
unguarded `importScripts()` calls on lines 7 and 9. So on Orion, Orion iOS
**and Firefox**, the very first statement of the file threw a `ReferenceError`
and the entire script aborted before a single listener was registered. Every
background-owned feature — `commands` shortcuts, `contextMenus`, the in-page
FAB's PDF/ZIP/DOCX/HTML exports, batch export, the toolbar icon state, the
"What's new" panel — is dead as a consequence, with no visible error anywhere
a user could reach.

**This is a cross-browser bug, not an Orion-specific one.** The Orion report
is what surfaced it; Firefox was affected by exactly the same mechanism.

## Decision

1. **Make `background.js` environment-portable rather than worker-only.**
   Guard the `importScripts()` calls with
   `if (typeof importScripts === 'function')`, and have `manifest.json` load
   the same two modules via `background.scripts: ["src/utils.js",
   "src/redact.js", "background.js"]` for the background-page browsers. Both
   keys stay — Chrome/Edge keep using `service_worker`, everything else gets a
   working background page. No build-time manifest rewriting, no bundler.
2. **Feature-detect the APIs that plausibly are not in Orion's ~70% port,
   instead of letting a missing one take the file down with it.**
   `api.commands.onCommand` was registered at top level; on a browser without
   `chrome.commands` (entirely plausible on a touch-only iOS browser) that
   throws and silently deregisters every listener *below* it. Same for
   `api.contextMenus.create` inside the `onInstalled` handler. Both are now
   guarded and record the gap into the health beacon instead.
3. **Answer "is the background script alive?" on the device itself.** See the
   next section.

### Should Inkpour's architecture work on Orion iOS?

Yes, architecturally — with the above fixed. Inkpour is **not** a
persistent-background extension. It has no long-lived connection, no
`webRequest` filtering (the thing that reportedly keeps uBlock Origin from
working on Orion iOS), no polling, no `alarms`. Every background entry point
is event-driven and short-lived: a message arrives, work runs, done. That is
the same shape as the extensions that are reported to work on Orion iOS and
the opposite of the ones that are not.

The feature that is genuinely background-dependent is **batch export**
(`runBatchExport()`), which deliberately lives in the background context so it
survives the popup closing while it drives background tabs one at a time. It
needs the background context to stay alive for tens of seconds across
`tabs.create`/`tabs.remove` cycles. That is the one responsibility that cannot
be moved into the popup or a content script without redesigning it, and it is
the one most exposed to aggressive suspension on iOS. Everything else
(keyboard shortcuts, context menus, FAB exports) is a per-event wake-up and
degrades gracefully to "that entry point is unavailable" if the API behind it
is missing.

## Making background health visible without a Mac

Standard debugging is not a realistic instruction for an iPhone user: Safari
Web Inspector requires a cabled Mac, inspects *Safari's* content, and reaching
a third-party browser's web views needs the app to opt in. And in the failure
mode above there is nothing running to attach to in the first place.

So the background context reports its own vital signs into
`chrome.storage.local` under `inkpour_bg_health`, and the popup's existing
Debug mode tooling reads them back. Two deliberately independent signals,
because the difference between them *is* the diagnosis:

- **A stored beacon** — written on boot and on every handled event. Carries
  `context` (`service_worker` vs `background_page` — the Orion tell),
  `bootedAt`, `bootCount` (makes suspend/restart churn a number instead of a
  hunch), `lastEvent`/`lastEventAt`, `lastError` (fed by `recordBgError()` plus
  global `error`/`unhandledrejection` handlers), and `apiSupport`, a
  presence-only probe of `commands`/`contextMenus`/`downloads`/`alarms`/
  `action.setIcon`/`storage.session`/`tabs.*`. Storage is the only channel
  that survives the context suspending, which live in-memory state cannot.
- **A live `bgPing` round-trip** from the popup, raced against a 2s timeout
  (some browsers leave `sendMessage()` pending forever with no listener rather
  than rejecting).

Crossing them yields three distinct verdicts, rendered in plain text into
`#bgHealthPanel` in the popup — on screen, on the phone, no tooling:

| ping | beacon | verdict |
| --- | --- | --- |
| replies | present | `RUNNING` — plus context, uptime, missing-API list |
| fails | present | `NOT RESPONDING` — it ran before, unreachable now (suspension/wake bug) |
| fails | absent | `NEVER STARTED` — this browser does not run the background script at all |

The same block is folded into `buildDebugReport()`'s output, so "Copy debug
info" and "Report bug" carry it automatically — "the background script never
started" is invisible in a DOM/selector report but explains a whole class of
symptoms. Like the rest of that report it is content-free: API names,
timestamps and error strings only, never chat text.

## What is still unknown (explicitly not claimed as verified)

- Whether, with the fix applied, Orion iOS's background page actually **stays
  alive long enough** for a multi-conversation batch export. Reported
  second-hand that extensions relying on constant background work "behave
  inconsistently once Orion gets backgrounded by iOS"; not measured here.
- Whether `chrome.downloads` works on Orion iOS at all. `background.js`
  already has a Safari fallback (`safeDownload()` → content-script
  `<a download>`), which should cover it, but this is untested there.
- Whether `contextMenus` and `commands` exist on Orion iOS. The new
  `apiSupport` probe is precisely the instrument for answering this from a
  real device — that is the next step, not a guess to make now.
- Kagi publishes no per-API, per-platform support matrix; the "~70%" figure is
  their own prose, not a checklist.

## Sources (addendum)

- [orionfeedback.org #13760 — Incorrect background environment preference in extensions](https://orionfeedback.org/d/13760-incorrect-background-environment-preference-in-extensions)
- [W3C WebExtensions CG issue #282 — background environment preference](https://github.com/w3c/webextensions/issues/282)
- [Orion iOS/iPadOS release notes](https://orionbrowser.com/updates/orion-iOS-release-notes) (1.3.0: "Essential Browser/Chrome variable not given in background and option pages")
- [MDN — `background` manifest key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) (Firefox MV3 uses event pages via `background.scripts`)
- [Apple — Inspecting iOS and iPadOS](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios) (Web Inspector requires a connected Mac)
