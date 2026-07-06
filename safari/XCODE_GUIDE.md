# Running Inkpour in Safari — Step-by-step guide

This guide walks you through building and loading the Inkpour Safari extension on your Mac from scratch. No prior Xcode experience required.

---

## What you need

- A Mac running macOS 13 (Ventura) or later
- Xcode 15 or later — download free from the [Mac App Store](https://apps.apple.com/app/xcode/id497799835)
- Safari 16 or later (included with macOS 13+)
- The Inkpour source code (this repo)

You do **not** need an Apple Developer account.

---

## Step 1 — Install Xcode

1. Open the Mac App Store and search for **Xcode**
2. Click **Get** → **Install** (it's ~10 GB, so give it time)
3. Once installed, open Xcode once so it finishes its first-run setup, then close it

Verify everything is set up — open Terminal and run:

```bash
xcode-select -p
# Should print: /Applications/Xcode.app/Contents/Developer
```

If it prints a different path:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

---

## Step 2 — Convert the extension to a Safari app

Safari extensions must be wrapped in a native macOS app. The `xcrun safari-web-extension-converter` tool does this automatically.

In Terminal, run (replace `YOUR_USERNAME` with your macOS username — run `whoami` if unsure):

```bash
xcrun safari-web-extension-converter /Users/YOUR_USERNAME/workspace/babelfish/inkpour \
  --app-name "Inkpour Safari" \
  --bundle-identifier com.inkpour.safari \
  --swift
```

You'll see two warnings about `downloads` and `open_in_tab` — both are expected and harmless, Inkpour handles them automatically.

You only need to run this once. Editing extension files later does **not** require re-running it.

---

## Step 3 — Build the app

```bash
xcodebuild \
  -project "/Users/YOUR_USERNAME/workspace/babelfish/inkpour/safari/Inkpour Safari/Inkpour Safari.xcodeproj" \
  -scheme "Inkpour Safari (macOS)" \
  -configuration Debug \
  -derivedDataPath /private/tmp/inkpour-safari-build \
  build 2>&1 | tail -5
```

The last line should say `** BUILD SUCCEEDED **`.

If you see `scheme not found`, list the available schemes first:

```bash
xcodebuild -project "/Users/YOUR_USERNAME/workspace/babelfish/inkpour/safari/Inkpour Safari/Inkpour Safari.xcodeproj" -list
```

Use whichever scheme contains `macOS` in the `-scheme` flag above.

---

## Step 4 — Enable Safari developer features

1. Open **Safari → Settings** (⌘,)
2. Click the **Advanced** tab
3. Tick **"Show features for web developers"**

This adds a **Develop** menu to the menu bar.

---

## Step 5 — Allow unsigned extensions

> ⚠️ Repeat this every time you restart Safari.

1. Click **Develop** in the menu bar
2. Click **Allow Unsigned Extensions**

No checkmark appears — clicking it is enough.

---

## Step 6 — Copy the app to Applications

Safari only discovers extensions from apps in `/Applications`:

```bash
cp -r "/private/tmp/inkpour-safari-build/Build/Products/Debug/Inkpour Safari.app" /Applications/
```

---

## Step 7 — Run the app and enable the extension

```bash
open "/Applications/Inkpour Safari.app"
```

A small window appears. Then:

1. Go to **Safari → Settings → Extensions**
2. You'll see **Inkpour Safari** — toggle it **on** (you may see two entries, enable both)

The Inkpour toolbar button will now appear when you visit a supported AI chat page.

---

## Updating after code changes

No need to re-run the converter. Just rebuild and recopy:

```bash
xcodebuild \
  -project "/Users/YOUR_USERNAME/workspace/babelfish/inkpour/safari/Inkpour Safari/Inkpour Safari.xcodeproj" \
  -scheme "Inkpour Safari (macOS)" \
  -configuration Debug \
  -derivedDataPath /private/tmp/inkpour-safari-build \
  build 2>&1 | tail -3

cp -r "/private/tmp/inkpour-safari-build/Build/Products/Debug/Inkpour Safari.app" /Applications/
```

Then quit and reopen Safari, and re-do Step 5.

---

## Troubleshooting

**"The application cannot be opened because its executable is missing"**
Point at `/private/tmp/inkpour-safari-build`, not `~/Library/Developer/Xcode/DerivedData`.

**Extension not visible in Safari → Settings → Extensions**
- Did you copy the `.app` to `/Applications`? (Step 6)
- Did you click **Develop → Allow Unsigned Extensions** after the last Safari restart? (Step 5)
- Did you run the app? (Step 7)

**"A required plugin failed to load" / Xcode crash**
Your Command Line Tools are out of sync with Xcode:
```bash
sudo rm -rf /Library/Developer/CommandLineTools
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -runFirstLaunch
```

**Build fails with "scheme not found"**
Run `xcodebuild -project "..." -list` to see the real scheme names.
