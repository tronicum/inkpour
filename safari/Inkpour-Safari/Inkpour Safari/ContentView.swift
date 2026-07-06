import SwiftUI
import SafariServices

// MARK: - Extension state helpers

private enum ExtensionState {
    case unknown
    case enabled
    case disabled
}

// MARK: - ContentView (macOS)

struct ContentView: View {
    @State private var extensionState: ExtensionState = .unknown
    @State private var isCheckingState = false

    var body: some View {
        VStack(spacing: 20) {
            Image("AppIcon")
                .resizable()
                .frame(width: 96, height: 96)
                .cornerRadius(20)

            Text("Inkpour")
                .font(.largeTitle)
                .fontWeight(.semibold)

            Text("Export AI chat conversations to Markdown, DOCX, PDF, JSON, and more.")
                .font(.body)
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
                .frame(maxWidth: 380)

            Divider()
                .padding(.vertical, 4)

            switch extensionState {
            case .enabled:
                Label("Inkpour is enabled in Safari", systemImage: "checkmark.circle.fill")
                    .foregroundColor(.green)
                    .font(.headline)

                Text("Open any supported AI chat site and click the Inkpour toolbar button to export.")
                    .font(.callout)
                    .multilineTextAlignment(.center)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: 380)

            case .disabled, .unknown:
                Label("Inkpour is not yet enabled", systemImage: "safari")
                    .foregroundColor(.orange)
                    .font(.headline)

                Text("To use Inkpour, you need to enable it in Safari's Extension preferences.")
                    .font(.callout)
                    .multilineTextAlignment(.center)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: 380)

                Button("Open Safari Extensions Preferences") {
                    openSafariExtensionPreferences()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }

            if isCheckingState {
                ProgressView()
                    .scaleEffect(0.8)
            }

            Spacer()

            Link("Privacy Policy", destination: URL(string: "https://github.com/tronicum/inkpour/blob/main/PRIVACY.md")!)
                .font(.footnote)
                .foregroundColor(.secondary)
        }
        .padding(40)
        .frame(minWidth: 480, minHeight: 360)
        .onAppear {
            checkExtensionState()
        }
    }

    // MARK: - Private helpers

    private func checkExtensionState() {
        isCheckingState = true
        SFSafariExtensionManager.getStateOfSafariExtension(
            withIdentifier: "com.inkpour.safari.Extension"
        ) { state, error in
            DispatchQueue.main.async {
                isCheckingState = false
                if let state = state {
                    extensionState = state.isEnabled ? .enabled : .disabled
                } else {
                    extensionState = .unknown
                }
            }
        }
    }

    private func openSafariExtensionPreferences() {
        SFSafariApplication.showPreferencesForExtension(
            withIdentifier: "com.inkpour.safari.Extension"
        ) { error in
            if let error = error {
                print("Could not open Safari extension preferences: \(error)")
            }
        }
    }
}

// MARK: - Preview

#Preview {
    ContentView()
}
