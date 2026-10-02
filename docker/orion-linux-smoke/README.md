# Orion (Linux/Flatpak) smoke-test harness

**Status: scaffold only, written 2026-09, never built, never run.**
Nothing in this directory has been verified. Treat the Dockerfile and
`smoke-test.py` as a documented starting point for the next session (or
Stefan, on his own machine) to build, debug, and fix — not a working
tool. See `planning/TODOs.md` → "Batch 16" for the spec this was scaffolded
from, and `planning/adr-orion-ios-automation.md` for the parallel
iOS/macOS ADR that established why Playwright is a dead end for Orion.

## What this is trying to prove

That Inkpour, loaded as an unpacked extension, actually:

1. Loads inside Orion running on Linux (Flatpak distribution) without
   crashing the browser.
2. Shows a toolbar icon.
3. Opens its popup when that icon is clicked, while on a page whose
   hostname is a supported site.

That's it. This is a thin smoke layer confirming "the extension loads and
shows up in this specific, currently-uncovered browser/OS combination" —
nothing more.

## What this explicitly does NOT prove

- Markdown/DOCX/PDF export correctness, or any extraction logic at all.
  That stays in the existing JSDOM suite (`test/run-jsdom.js`) and the
  Playwright Chromium e2e suite — this harness never duplicates it.
- Per-platform DOM/selector correctness (ChatGPT vs Claude vs Gemini
  etc).
- Any interaction beyond "toolbar icon exists, click it, popup opens."
  No export tap-through, no download verification, no settings page.
- Orion's WebExtensions API compatibility beyond what's needed to render
  a toolbar icon and a popup — Orion's own extension support is
  beta/partial coverage (see the ADR for the equivalent iOS caveat); a
  failure here could be an Orion limitation, not an Inkpour bug.

## The one open question that could block the first real run

**Does Flatpak's sandboxing block the unpacked-extension load path?**

Orion on Linux is distributed only via Flatpak
(orionbrowser.com/platforms/linux). Flatpak apps are sandboxed by
default, including filesystem access. Loading an "unpacked" extension
almost certainly requires either a CLI flag pointing at a host path, or
an in-app file-picker flow that reaches into an arbitrary host directory
(the mounted Inkpour source tree). Neither is confirmed to work through
Flatpak's sandbox without an explicit `--filesystem=` override on
`flatpak run`, or a portal permission grant that may not even exist for
non-interactive/scripted use.

**Verify this manually, first, before investing more time in the dogtail
script:**

```sh
flatpak run --filesystem=/path/to/inkpour com.kagi.orion
# then, by hand, try to load Inkpour as an unpacked extension and see if
# the file picker can even navigate to the mounted path.
```

If this is blocked, the whole approach in this directory may need to
switch to baking Inkpour's source into the Flatpak's own sandboxed
filesystem at image-build time (e.g. copying it under
`~/.var/app/com.kagi.orion/...` inside the container) rather than relying
on a live bind mount — flag that in `planning/TODOs.md` if confirmed.

## Other unverified assumptions baked into this scaffold

- **Flatpak app ID** (`com.kagi.orion`) is a guess based on Kagi's usual
  naming convention, not confirmed against Flathub's actual listing.
- **`--load-extension=<path>`** as Orion's unpacked-extension CLI flag is
  a guess by analogy to Chromium; Orion may not support any CLI flag for
  this at all, in which case `smoke-test.py`'s `_launch_orion()` needs to
  be rewritten to drive the in-app "load unpacked extension" UI via
  dogtail instead (this is also where the Flatpak sandbox question above
  would bite hardest).
- **Every dogtail role/name selector** in `smoke-test.py` (toolbar icon,
  popup frame) is a best guess based on typical GTK/WebKitGTK
  accessibility trees, not a confirmed dump of Orion's actual tree. Expect
  to need `dogtail.tree.root.dump()` (or the `accerciser` GUI tool, with a
  forwarded display) against a real running Orion to fix these.
- **Test page**: rather than requiring a live authenticated account on a
  real supported site, the script serves a minimal local static HTML page
  over `127.0.0.1` and treats it as a stand-in for a supported site's
  content. This sidesteps needing test credentials inside a disposable
  container, at the cost of not actually exercising Inkpour's
  site-detection logic against a real hostname. If a later pass needs the
  popup to reflect genuine "supported site" state, revisit this (a
  hosts-file alias trick or a real fixture server matching a supported
  hostname are both options) — see the comment in `smoke-test.py`'s
  `_write_fixture_page()`.

## Build and run (once the above is checked out)

```sh
cd docker/orion-linux-smoke
docker build -t inkpour-orion-smoke .
docker run --rm \
  -v /path/to/inkpour:/inkpour:ro \
  inkpour-orion-smoke
```

Exit code 0 = pass, non-zero = fail, with diagnostic output on stderr from
`smoke-test.py` explaining what stage failed.

## Suggested next steps for whoever picks this up

1. Manually verify the Flatpak sandbox question above, on a real Linux
   box, before trusting anything else here.
2. Confirm Orion's actual Flathub app ID and its actual unpacked-extension
   load mechanism (CLI flag vs. in-app UI flow).
3. `docker build` this image and fix whatever breaks (package names,
   Flathub install step, Xvfb/AT-SPI wiring — none of this has been
   exercised even once).
4. Get a raw AT-SPI accessibility-tree dump of a real running Orion
   window and rewrite the role/name selectors in `smoke-test.py`
   accordingly.
5. Only then consider wiring this into CI (or keep it local-only,
   mirroring the "local, on-demand" decision made for the Orion-iOS ADR,
   if a real Linux+Xvfb CI runner isn't readily available).
