Subject: Simulator/TestFlight build for automated WebExtension testing on Orion iOS?

Hi Kagi team,

I maintain Inkpour, a WebExtension (Firefox/Chrome, Manifest V3) that exports AI chat conversations to Markdown/PDF/HTML. Orion iOS has been a great surprise for us — as far as I know it's the only mobile browser that runs Chrome/Firefox WebExtensions directly, and Inkpour already works well there on a real device.

I'd like to add Orion iOS to our automated test coverage (we already automate Chromium via Playwright), but the iOS Simulator can't install App Store or public TestFlight builds — Simulator only runs apps built with an iphonesimulator SDK target.

Is there any chance you could provide:
- A Simulator-compatible build of Orion iOS (even an internal/dev one), or
- Guidance on whether Orion iOS extension support could be exercised any other way for CI/local automation (e.g. via Appium/XCUITest against a real device, or some other hook)?

Happy to share our test suite or extension details if useful. Thanks for building genuinely novel browser tech here — happy to help validate it further.

Best,
tronicum (github.com/tronicum)

---
## Where to send this
No email/form-sending tool is available to me directly — you'll need to send it yourself via one of:
- **Email**: support@kagi.com (from `sels@tnwx.net`, per help.kagi.com/orion/support-and-community/email-support.html)
- **Feedback forum**: https://orionfeedback.org — likely the better channel for a dev-facing ask like this one
- **Discord**: Kagi/Orion community server (linked from help.kagi.com/orion/support-and-community/discord-server.html)
