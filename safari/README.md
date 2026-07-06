# Inkpour — Safari Web Extension

This directory contains everything needed to ship Inkpour as a Safari Web Extension on iOS and macOS via the App Store.

---

## Prerequisites

- **Xcode 15 or later** — download from the Mac App Store (free)
- **Apple Developer Program membership** — $99/year, enroll at [developer.apple.com/enroll](https://developer.apple.com/enroll/)
- **macOS Ventura 13 or later** (required for Xcode 15)
- The Inkpour extension source at `/path/to/inkpour` (the parent directory of this `safari/` folder)

---

## Step 1: One-time conversion

The `safari-web-extension-converter` tool reads the existing MV3 extension and generates a complete Xcode project.

Run this once from the repo root (the directory containing `manifest.json`):

```bash
xcrun safari-web-extension-converter \
  /path/to/inkpour \
  --project-location ./safari/Inkpour-Safari \
  --app-name "Inkpour" \
  --bundle-identifier com.inkpour.safari \
  --swift \
  --ios-only \
  --no-prompt
```

Remove `--ios-only` if you want a macOS target as well (produces a multi-platform project).

The converter will:
1. Copy all extension files (`manifest.json`, JS, HTML, icons) into `Inkpour Safari Extension/Resources/`
2. Generate a Swift app wrapper with `ContentView.swift`, `SafariWebExtensionHandler.swift`, and a working Xcode project file
3. Print a checklist of items to review

> **Note:** The stub files in `safari/Inkpour-Safari/` are templates showing the expected structure. After running the converter, the generated project in the same location supersedes them. Commit the generated project, not the stubs.

---

## Step 2: Open the Xcode project

```bash
open safari/Inkpour-Safari/Inkpour\ Safari.xcodeproj
```

Or double-click the `.xcodeproj` file in Finder.

---

## Step 3: Configure signing

1. Select the **Inkpour Safari** target in the project navigator
2. Open the **Signing & Capabilities** tab
3. Set **Team** to your Apple Developer team
4. Xcode will auto-manage provisioning profiles if you leave **Automatically manage signing** checked
5. Repeat for the **Inkpour Safari Extension** target
6. If building for iOS, repeat for **Inkpour Safari iOS** and **Inkpour Safari iOS Extension**

Bundle identifiers:
- App: `com.inkpour.safari`
- Extension: `com.inkpour.safari.Extension`
- iOS App: `com.inkpour.safari.ios`
- iOS Extension: `com.inkpour.safari.ios.Extension`

---

## Step 4: Required Info.plist entries

The converter populates most keys automatically. Verify these are present and correct in each target's `Info.plist`:

### App target (`Inkpour Safari/Info.plist`)

| Key | Value |
|-----|-------|
| `CFBundleDisplayName` | Inkpour |
| `CFBundleIdentifier` | com.inkpour.safari |
| `CFBundleShortVersionString` | 0.2.3 |
| `CFBundleVersion` | 1 |
| `NSHumanReadableCopyright` | Copyright © 2026 tronicum. All rights reserved. |

### Extension target (`Inkpour Safari Extension/Info.plist`)

The extension plist needs:
- `NSExtension` → `NSExtensionPointIdentifier` = `com.apple.Safari.web-extension`
- `SFSafariWebExtensionToolbarItem` with `Action` = `Toolbar` and `Identifier` matching the extension ID

Add a usage description for each permission the extension requests. For Inkpour, add under the app target:

```xml
<key>NSDownloadsFolderUsageDescription</key>
<string>Inkpour saves exported chat files to your Downloads folder.</string>
```

---

## Step 5: Privacy manifest (PrivacyInfo.xcprivacy)

Apple requires a privacy manifest for all new App Store submissions.

The file `safari/PrivacyInfo.xcprivacy` in this repo declares that Inkpour:
- Collects no personal data
- Accesses no privacy-sensitive device APIs

Add this file to **both** the app target and the extension target by dragging it into the Xcode project navigator and checking both targets in the "Add to targets" dialog.

---

## Step 6: Test on device

### Simulator
1. In Xcode, select an iPhone or iPad simulator from the scheme selector
2. Press **Cmd+R** to build and run
3. In the simulator, open Safari and navigate to `chatgpt.com`
4. Tap the **AA** button in the address bar → **Manage Extensions** → enable Inkpour

### Physical device
1. Connect your iPhone or iPad via USB
2. Trust the Mac on the device when prompted
3. Select your device in the Xcode scheme selector
4. Press **Cmd+R** — Xcode installs the app
5. On device: **Settings → Apps → Safari → Extensions → Inkpour → Allow**
6. Open Safari, navigate to any supported AI chat site

### macOS
- After running the app, enable the extension in **Safari → Settings → Extensions**
- Grant permissions per-site when Safari prompts

---

## Step 7: App Store screenshots

See `safari/store-assets/README.md` for the full screenshot specification. Required sizes:

| Device | Resolution | Count |
|--------|-----------|-------|
| 6.7" iPhone (iPhone 15 Pro Max) | 1290 × 2796 px | 3 minimum |
| 12.9" iPad Pro | 2048 × 2732 px | 3 minimum |
| macOS (if shipping Mac app) | 2880 × 1800 px | 3 minimum |

---

## Step 8: App Store Connect submission checklist

- [ ] Increment `CFBundleShortVersionString` for each new release
- [ ] Increment `CFBundleVersion` (build number) for every upload
- [ ] Archive the app: **Product → Archive** in Xcode
- [ ] In the Organizer, click **Distribute App** → **App Store Connect** → **Upload**
- [ ] Log in to [appstoreconnect.apple.com](https://appstoreconnect.apple.com/)
- [ ] Create a new app record (if first submission):
  - Platform: iOS (and/or macOS)
  - Bundle ID: `com.inkpour.safari` / `com.inkpour.safari.ios`
  - SKU: `inkpour-safari`
- [ ] Fill in App Information: name, subtitle, category (Productivity), keywords
- [ ] Paste the App Store description from `safari/store-assets/README.md`
- [ ] Upload screenshots for each required device size
- [ ] Set the price (Free)
- [ ] Privacy policy URL — you can host PRIVACY.md as a GitHub Pages page or use a service like privacypolicygenerator.info. Minimum URL: `https://github.com/tronicum/inkpour/blob/main/PRIVACY.md`
- [ ] Age rating: complete the questionnaire (Inkpour = 4+, no objectionable content)
- [ ] Submit for review — typical review time 24–48 hours

---

## Notes on iOS-specific behavior

- Safari extensions on iOS run inside Safari's JavaScript environment, the same as on macOS
- The `downloads` permission is not supported on iOS — file downloads use the share sheet instead. The converter will warn about unsupported permissions; `downloads` can be left in the manifest (Safari ignores it on iOS) or removed if you build an iOS-only variant
- Keyboard shortcuts (`commands` in manifest.json) are not available on iOS — keyboard shortcut buttons in the popup will silently do nothing. Consider hiding them in the popup UI when `navigator.platform` matches iOS
- The extension popup appears as a sheet from the Extensions button in the Safari toolbar
- `contextMenus` API is not available on iOS — right-click context menu items will not appear
- Users find and enable the extension at: **Settings → Apps → Safari → Extensions** (iOS 18+) or **Settings → Safari → Extensions** (iOS 17 and earlier)
- The extension must be enabled per-website or globally — Safari prompts the user on first visit to a supported site

---

## Updating the extension

After running the converter once, subsequent extension updates do not require re-running it. Edit the source JS/HTML in `Inkpour Safari Extension/Resources/` (which mirrors the original extension files) and rebuild in Xcode.

To sync changes from the main extension source back to the Safari copy, run:

```bash
rsync -av --exclude='.git' --exclude='node_modules' --exclude='safari' \
  /path/to/inkpour/ \
  /path/to/inkpour/safari/Inkpour-Safari/Inkpour\ Safari\ Extension/Resources/
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "No such module 'SafariServices'" | Ensure the deployment target is iOS 15+ / macOS 13+ |
| Extension not appearing in Safari | Rebuild and re-run the app; the app must be launched at least once before the extension is available |
| "Missing privacy manifest" in TestFlight | Add `PrivacyInfo.xcprivacy` to both the app and extension targets |
| Popup blank on iOS | Check that `popup.html` loads via `safari-extension://` — add the extension's origin to `web_accessible_resources` if needed |
| Downloads not working on iOS | Implement share sheet fallback using `navigator.share({ files: [...] })` for the iOS code path |
