# Running Inkpour in Safari — Step-by-step guide

This guide walks you through building and loading the Inkpour Safari extension on your Mac from scratch. No prior Xcode experience required.

---

## What you need

- A Mac running macOS 13 (Ventura) or later
- Xcode 15 or later — download free from the [Mac App Store](https://apps.apple.com/app/xcode/id497799835)
- Safari 16 or later (included with macOS 13+)
- The Inkpour source code (this repo)

You do **not** need an Apple Developer account to test locally.

---

## Step 1 — Install Xcode

1. Open the Mac App Store and search for **Xcode**
2. Click **Get** → **Install** (it's ~10 GB, so give it time)
3. Once installed, open Xcode once so it finishes its first-run setup, then close it

To verify everything is set up correctly, open Terminal and run:

```bash
xcode-select -p
# Should print: /Applications/Xcode.app/Contents/Developer
```

If it prints a different path, run:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

---

## Step 2 — Convert the extension to a Safari app

Safari extensions must be wrapped in a native macOS app. The `xcrun safari-web-extension-converter` tool does this automatically.

Open Terminal and run:

```bash
xcrun safari-web-extension-converter /Users/YOUR_USERNAME/workspace/babelfish/inkpour \
  --app-name "Inkpour Safari" \
  --bundle-identifier com.inkpour.safari \
  --swift
```

Replace `YOUR_USERNAME` with your actual macOS username (run `whoami` in Terminal if unsure).

**Expected output:**
```
App Name: Inkpour Safari
App Bundle Identifier: com.inkpour.safari
Platform: All
Language: Swift
Warning: The following keys in your manifest.json are not supported ...
    downloads
    open_in_tab
```

The two warnings are expected and harmless — Inkpour handles them automatically.

The converter creates a folder called `Inkpour Safari` inside the `safari/` directory containing the Xcode project. You only need to run this command once. If you change extension files later (like `background.js`), you do **not** need to re-run the converter — just rebuild (Step 3).

---

## Step 3 — Build the app

In Terminal, run:

```bash
xcodebuild \
  -project "/Users/YOUR_USERNAME/workspace/babelfish/inkpour/safari/Inkpour Safari/Inkpour Safari.xcodeproj" \
  -scheme "Inkpour Safari (macOS)" \
  -configuration Debug \
  -derivedDataPath /private/tmp/inkpour-safari-build \
  build 2>&1 | tail -5
```

The last line of output should say `** BUILD SUCCEEDED **`.

If you see `scheme not found`, first run this to list available schemes:

```bash
xcodebuild -project "/Users/YOUR_USERNAME/workspace/babelfish/inkpour/safari/Inkpour Safari/Inkpour Safari.xcodeproj" -list
```

Use whichever scheme contains `macOS` in the `-scheme` flag above.

---

## Step 4 — Enable Safari developer features

1. Open **Safari**
2. Go to **Safari → Settings** (or press ⌘,)
3. Click the **Advanced** tab
4. Tick **"Show features for web developers"**

This adds a **Develop** menu to the Safari menu bar.

---

## Step 5 — Allow unsigned extensions

> ⚠️ You need to repeat this step every time you restart Safari.

1. In the Safari menu bar, click **Develop**
2. Click **Allow Unsigned Extensions**

There is no checkmark or confirmation — clicking it is enough.

---

## Step 6 — Copy the app to Applications

Safari only discovers extensions from apps in the `/Applications` folder:

```bash
cp -r "/private/tmp/inkpour-safari-build/Build/Products/Debug/Inkpour Safari.app" /Applications/
```

---

## Step 7 — Run the app and enable the extension

1. Open the app:
```bash
open "/Applications/Inkpour Safari.app"
```

A small window will appear telling you to enable the extension in Safari.

2. Go to **Safari → Settings → Extensions**
3. You should see **Inkpour Safari** listed — toggle it **on**
4. You may see two entries (the app and the extension) — enable both

The Inkpour toolbar button (🖋) will now appear in Safari's toolbar when you visit a supported AI chat page.

---

## Updating after code changes

When you edit extension files (e.g. `background.js`, `content.js`), you don't need to re-run the converter. Just rebuild and copy again:

```bash
xcodebuild \
  -project "/Users/YOUR_USERNAME/workspace/babelfish/inkpour/safari/Inkpour Safari/Inkpour Safari.xcodeproj" \
  -scheme "Inkpour Safari (macOS)" \
  -configuration Debug \
  -derivedDataPath /private/tmp/inkpour-safari-build \
  build 2>&1 | tail -3

cp -r "/private/tmp/inkpour-safari-build/Build/Products/Debug/Inkpour Safari.app" /Applications/
```

Then quit and reopen Safari (and re-do Step 5).

---

## Troubleshooting

**"The application cannot be opened because its executable is missing"**
You're pointing at the wrong path. The real build output is in `/private/tmp/inkpour-safari-build`, not `~/Library/Developer/Xcode/DerivedData`.

**Extension not visible in Safari → Settings → Extensions**
- Did you copy the `.app` to `/Applications`? (Step 6)
- Did you click **Develop → Allow Unsigned Extensions** *after* the last Safari restart? (Step 5)
- Did you run the app? (Step 7, first bullet)

**"A required plugin failed to load" / Xcode crash on first launch**
Your Command Line Tools are out of sync with Xcode. Fix with:
```bash
sudo rm -rf /Library/Developer/CommandLineTools
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -runFirstLaunch
```

**Build fails with "scheme not found"**
Run `xcodebuild -project "..." -list` to see the real scheme names and substitute accordingly.

---

## App Store distribution

To publish on the App Store you need a paid **Apple Developer Program** membership ($99/year). See `safari/README.md` for the full submission checklist including privacy manifests, screenshots, and review notes.

> **License note:** Inkpour is AGPL-3.0. You (the copyright holder) can distribute your own copy on the App Store. Third parties cannot, because Apple's redistribution restrictions conflict with the AGPL. To allow others to ship it commercially, consider dual-licensing.
