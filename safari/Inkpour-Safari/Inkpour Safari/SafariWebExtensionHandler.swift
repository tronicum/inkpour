import SafariServices
import os.log

private let logger = Logger(subsystem: "com.inkpour.safari.Extension", category: "Extension Handler")

/// SafariWebExtensionHandler is the bridge between the JavaScript extension and native Swift code.
///
/// Inkpour does all its work in JavaScript and does not need native Swift functionality beyond
/// what the web extension runtime provides. This handler is a required stub; it will be called
/// by Safari when the extension sends a message via `browser.runtime.sendNativeMessage()`.
///
/// If you add native features in the future (e.g. writing files via FileManager, accessing
/// the system keychain, or showing native UI), implement them here by examining
/// `context.inputItems` and responding via `context.completeRequest(returningItems:)`.
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        guard
            let item = context.inputItems.first as? NSExtensionItem,
            let userInfo = item.userInfo as? [String: Any],
            let message = userInfo[SFExtensionMessageKey]
        else {
            logger.error("Received extension request with no message payload")
            context.completeRequest(returningItems: nil, completionHandler: nil)
            return
        }

        logger.debug("Received message from JavaScript: \(String(describing: message))")

        // Inkpour's JavaScript layer handles all export logic natively.
        // No native response is needed — return an empty acknowledgement.
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: ["status": "ok"]]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
