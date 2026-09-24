# Orion (Linux/Flatpak) smoke-test container — UNVERIFIED SCAFFOLD
#
# Status: written 2026-09, never built, never run. This is a starting point
# for Stefan to build/debug on his own machine, not a working artifact.
# See planning/TODOs.md "Batch 16" and docker/orion-linux-smoke/README.md
# before touching this.
#
# Goal: boot Orion (Kagi's WebKit-based browser, distributed on Linux only
# via Flatpak per orionbrowser.com/platforms/linux) inside a headless
# container under Xvfb, load Inkpour as an unpacked extension from a
# mounted host path, and drive it with AT-SPI/dogtail (accessibility-tree
# automation) instead of Playwright — Orion exposes no CDP or Playwright
# automation protocol, see planning/adr-orion-ios-automation.md for the
# parallel iOS constraint that established this.
#
# KNOWN OPEN RISK (read planning/TODOs.md Batch 16 before running):
# Flatpak sandboxes an app's filesystem access by default. Orion's
# "load unpacked extension" flow almost certainly goes through a native
# file picker (GTK portal), and it is UNCONFIRMED whether that picker can
# reach an arbitrary host directory (the mounted Inkpour source) from
# inside the Flatpak sandbox without an explicit --filesystem override at
# `flatpak run` time, or a portal permission grant that doesn't exist
# non-interactively. This could be a hard blocker discovered on the very
# first real run — verify it first with a manual `flatpak run` smoke check
# before investing time in the dogtail script below.

FROM debian:bookworm-slim

# --- Base packages -----------------------------------------------------
# flatpak: to install/run Orion
# xvfb: virtual X11 display, since there's no physical/real display in CI
#   or a container
# x11-utils, xauth: common Xvfb companions, occasionally needed by GTK apps
# at-spi2-core: the AT-SPI accessibility bus/daemon that dogtail talks to
# python3, python3-pip, python3-gi, gir1.2-atspi-2.0: dogtail's runtime deps
#   (dogtail is a thin Python wrapper over PyGObject bindings to AT-SPI)
# dbus-x11: AT-SPI runs over D-Bus; most Flatpak/GTK apps also expect a
#   session bus to be running
# ca-certificates: flatpak needs to fetch from Flathub over TLS
RUN apt-get update && apt-get install -y --no-install-recommends \
        flatpak \
        xvfb \
        x11-utils \
        xauth \
        at-spi2-core \
        dbus-x11 \
        python3 \
        python3-pip \
        python3-gi \
        gir1.2-atspi-2.0 \
        ca-certificates \
        wget \
    && rm -rf /var/lib/apt/lists/*

# dogtail itself isn't reliably on PyPI with current metadata; installing
# via pip with --break-system-packages because this is a disposable
# container, not a managed host. Adjust if pip/dogtail packaging has moved
# on by the time this is actually run.
RUN pip3 install --break-system-packages --no-cache-dir dogtail

# --- Flatpak + Flathub remote -------------------------------------------
# Orion is distributed on Flathub. Confirm the actual app ID before
# running this for real — placeholder below is a best guess based on
# Kagi's naming convention (com.kagi.orion) and has NOT been verified
# against the live Flathub listing.
RUN flatpak remote-add --if-not-exists flathub \
        https://flathub.org/repo/flathub.flatpakrepo

# Orion Flatpak app ID — VERIFY before relying on this, may differ.
ARG ORION_FLATPAK_ID=com.kagi.orion
RUN flatpak install -y --noninteractive flathub "${ORION_FLATPAK_ID}" || \
    echo "WARNING: flatpak install failed or app id is wrong — see comment above, fix ORION_FLATPAK_ID and re-check Flathub's actual listing"

ENV ORION_FLATPAK_ID=${ORION_FLATPAK_ID}
ENV DISPLAY=:99
# Screen size/depth chosen arbitrarily as "big enough for a browser
# window + toolbar," adjust if Orion needs more.
ENV XVFB_RESOLUTION=1280x1024x24

# Mount point where the host is expected to bind-mount the Inkpour repo
# (unpacked extension source) at container run time, e.g.:
#   docker run -v /path/to/inkpour:/inkpour:ro ...
VOLUME ["/inkpour"]

WORKDIR /smoke
COPY smoke-test.py /smoke/smoke-test.py

# Entrypoint starts Xvfb, waits for it, then hands off to the Python
# smoke-test script, which is itself responsible for launching Orion via
# `flatpak run` and driving it through dogtail. Written as a small inline
# shell script rather than a separate file to keep this scaffold to two
# files; feel free to split it out once this is actually being iterated on.
ENTRYPOINT ["/bin/sh", "-c", "\
    Xvfb $DISPLAY -screen 0 $XVFB_RESOLUTION -nolisten tcp & \
    XVFB_PID=$! ; \
    sleep 2 ; \
    dbus-run-session -- python3 /smoke/smoke-test.py ; \
    STATUS=$? ; \
    kill $XVFB_PID 2>/dev/null ; \
    exit $STATUS \
"]
