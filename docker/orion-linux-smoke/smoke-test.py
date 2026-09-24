#!/usr/bin/env python3
"""Orion (Linux/Flatpak) smoke test — UNVERIFIED SCAFFOLD, never run.

Written 2026-09 as a starting point for planning/TODOs.md "Batch 16" —
this has NOT been executed, NOT been debugged against a real Orion window,
and every dogtail role/name lookup below is a best guess based on typical
GTK/WebKitGTK accessibility trees, not a confirmed accessibility dump of
Orion itself. Expect to spend real time in `dogtail.tree.root.dump()`
(or the `accerciser` GUI tool, if you forward a real display) fixing the
selectors before this passes.

Scope (per planning/TODOs.md Batch 16 "Scope for a first pass" — DO NOT
expand this without updating that TODO first):
  1. Launch Orion (via `flatpak run`) under Xvfb.
  2. Load Inkpour as an unpacked extension from the mounted /inkpour path.
  3. Confirm the toolbar icon renders.
  4. Click the toolbar icon and confirm the popup opens on a page whose
     hostname is one of Inkpour's supported sites.
  5. Exit non-zero on any failure, zero on success.

Explicitly OUT of scope here (stays in test/run-jsdom.js and the
Playwright Chromium e2e suite):
  - Markdown/DOCX/PDF extraction correctness.
  - Per-platform selector correctness (ChatGPT/Claude/Gemini/etc DOM shape).
  - Any assertion beyond "the extension is present and the popup opens."

Why AT-SPI/dogtail and not raw coordinates: dogtail queries the
accessibility tree by role and name (e.g. "push button" named "Inkpour"),
which survives window resizes/theme changes/DPI differences — a
coordinate click at (x, y) does not. This is called out explicitly in the
Batch 16 TODO as the reason to prefer dogtail over xdotool/wmctrl.

Test-page choice: rather than requiring a live, authenticated account on
a real supported site (ChatGPT/Claude/Gemini/etc), this script serves a
minimal local static page over 127.0.0.1 and points Orion at it. See
`_write_fixture_page()` below and the README for why — the goal here is
"does the popup open at all," not "does it show real conversation data,"
so a fixture avoids needing test credentials inside a disposable
container. If Inkpour's popup logic gates on more than hostname (e.g. it
also inspects page content before enabling itself), this fixture will
need to grow; that's a known limitation, not a silent gap — flag it if
hit.
"""

import http.server
import os
import subprocess
import sys
import tempfile
import threading
import time

# dogtail imports are deferred into main() so `python3 smoke-test.py --help`
# style invocations don't require a running AT-SPI bus just to parse args.


ORION_FLATPAK_ID = os.environ.get("ORION_FLATPAK_ID", "com.kagi.orion")
INKPOUR_PATH = os.environ.get("INKPOUR_PATH", "/inkpour")

# Pick a hostname already present in supported-sites.json so Inkpour's own
# host-permission/site-detection logic treats this as a "supported site"
# without needing a live account. claude.ai is used here only as an
# example value pulled from manifest.json's host_permissions at scaffold
# time — re-check supported-sites.json/manifest.json if this drifts.
FIXTURE_HOSTNAME_LABEL = "claude.ai"
FIXTURE_PORT = 8765

STARTUP_TIMEOUT_S = 30
POPUP_TIMEOUT_S = 15


def _write_fixture_page(tmpdir):
    """Write a minimal static HTML page standing in for a supported site.

    This does NOT actually serve content at claude.ai — Orion inside the
    container has no real network path to the live site anyway, and this
    smoke test isn't allowed to depend on one. Instead this serves the
    fixture over plain 127.0.0.1 and the test only asserts the toolbar
    icon + popup open, which per Batch 16's scope doesn't require the
    extension's site-detection logic to fire correctly. If a future pass
    of this test needs the popup content itself to reflect "supported
    site" state, this fixture and/or a hosts-file trick to alias
    claude.ai to 127.0.0.1 inside the container will need revisiting —
    flagged here rather than silently faked.
    """
    index = os.path.join(tmpdir, "index.html")
    with open(index, "w") as f:
        f.write(
            "<!doctype html><html><head><title>Inkpour smoke fixture"
            "</title></head><body><h1>Inkpour Orion smoke-test fixture"
            f"</h1><p>Stand-in for {FIXTURE_HOSTNAME_LABEL}.</p>"
            "</body></html>\n"
        )
    return index


def _serve_fixture(tmpdir):
    handler = lambda *a, **kw: http.server.SimpleHTTPRequestHandler(
        *a, directory=tmpdir, **kw
    )
    httpd = http.server.HTTPServer(("127.0.0.1", FIXTURE_PORT), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd


def _launch_orion():
    """Launch Orion via flatpak run, pointed at Inkpour as an unpacked ext.

    NOTE: the actual CLI flag/mechanism Orion uses to load an unpacked
    extension from disk is UNCONFIRMED — this assumes something roughly
    analogous to Chromium's --load-extension, since Orion advertises
    Chrome-extension compatibility, but Orion's own flag name (if any)
    needs to be checked against `flatpak run com.kagi.orion --help` (if
    it even accepts CLI flags) or its in-app "load unpacked" UI flow on a
    real run. If there's no CLI flag, this function needs to be rewritten
    to drive the in-app extensions-management UI via dogtail instead
    (open Orion, navigate to extensions settings, click "load unpacked",
    type/paste the path into the file-picker dialog) — which is also
    where the Flatpak-sandbox file-picker risk flagged in the Dockerfile
    and README would actually surface.
    """
    cmd = [
        "flatpak",
        "run",
        ORION_FLATPAK_ID,
        # Placeholder flag — verify against a real Orion run.
        f"--load-extension={INKPOUR_PATH}",
        f"http://127.0.0.1:{FIXTURE_PORT}/index.html",
    ]
    print(f"[smoke] launching: {' '.join(cmd)}", file=sys.stderr)
    return subprocess.Popen(cmd)


def _wait_for_app(dogtail_tree, app_name, timeout_s):
    import time as _time

    deadline = _time.time() + timeout_s
    while _time.time() < deadline:
        for app in dogtail_tree.root.applications():
            if app_name.lower() in app.name.lower():
                return app
        _time.sleep(1)
    return None


def main():
    if not os.path.isdir(INKPOUR_PATH):
        print(
            f"[smoke] FAIL: INKPOUR_PATH={INKPOUR_PATH!r} not found — "
            "did you bind-mount the repo with `-v /path/to/inkpour:/inkpour:ro`?",
            file=sys.stderr,
        )
        return 1

    # Deferred import: needs AT-SPI/D-Bus already up, which the Dockerfile's
    # entrypoint arranges via `dbus-run-session` before invoking this script.
    try:
        from dogtail import tree as dogtail_tree
        from dogtail.predicate import GenericPredicate
    except ImportError as e:
        print(f"[smoke] FAIL: dogtail not importable: {e}", file=sys.stderr)
        return 1

    with tempfile.TemporaryDirectory() as tmpdir:
        _write_fixture_page(tmpdir)
        httpd = _serve_fixture(tmpdir)
        try:
            orion_proc = _launch_orion()
            try:
                print("[smoke] waiting for Orion to appear on AT-SPI bus...", file=sys.stderr)
                app = _wait_for_app(dogtail_tree, "orion", STARTUP_TIMEOUT_S)
                if app is None:
                    print(
                        "[smoke] FAIL: Orion never appeared in the AT-SPI "
                        "application tree within "
                        f"{STARTUP_TIMEOUT_S}s. Possible causes: wrong "
                        "flatpak app ID, Orion crashed on launch (check "
                        "container logs), Orion doesn't register with "
                        "AT-SPI by default (some WebKitGTK apps need an "
                        "env var like GTK_A11Y or WEBKIT_A11Y enabled), or "
                        "the --load-extension flag above is wrong and "
                        "Orion refused to start.",
                        file=sys.stderr,
                    )
                    return 1

                # Toolbar icon lookup: guessing at role "push button" or
                # "icon" named after the extension ("Inkpour"). Real name/
                # role almost certainly needs adjustment once someone has
                # actually dumped Orion's accessibility tree
                # (dogtail.tree.root.dump() with a display forwarded, or
                # `accerciser`).
                print("[smoke] looking for Inkpour toolbar icon...", file=sys.stderr)
                toolbar_icon = None
                try:
                    toolbar_icon = app.child(
                        name="Inkpour", roleName="push button"
                    )
                except Exception:
                    toolbar_icon = None

                if toolbar_icon is None:
                    print(
                        "[smoke] FAIL: could not find a toolbar element "
                        "named 'Inkpour' with roleName 'push button'. This "
                        "selector is a first guess, not confirmed — dump "
                        "the accessibility tree and fix the role/name "
                        "here. Also re-check that the unpacked-extension "
                        "load actually succeeded (see the open question "
                        "about Flatpak sandboxing in README.md).",
                        file=sys.stderr,
                    )
                    return 1

                print("[smoke] clicking toolbar icon...", file=sys.stderr)
                toolbar_icon.click()

                # Popup lookup: guessing this shows up as a new top-level
                # window or a "frame"/"dialog" role child of the app.
                # Also unconfirmed against a real run.
                print("[smoke] waiting for popup to open...", file=sys.stderr)
                popup = None
                deadline = time.time() + POPUP_TIMEOUT_S
                while time.time() < deadline and popup is None:
                    try:
                        popup = app.child(roleName="frame", name="Inkpour")
                    except Exception:
                        popup = None
                    if popup is None:
                        time.sleep(1)

                if popup is None:
                    print(
                        "[smoke] FAIL: popup did not appear within "
                        f"{POPUP_TIMEOUT_S}s after clicking the toolbar "
                        "icon. Selector for the popup frame is a guess — "
                        "verify against a real accessibility-tree dump.",
                        file=sys.stderr,
                    )
                    return 1

                print(
                    "[smoke] PASS: toolbar icon found, popup opened.",
                    file=sys.stderr,
                )
                return 0
            finally:
                orion_proc.terminate()
                try:
                    orion_proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    orion_proc.kill()
        finally:
            httpd.shutdown()


if __name__ == "__main__":
    sys.exit(main())
