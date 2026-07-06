import SwiftUI
import SafariServices

// MARK: - ContentView (iOS)

struct ContentView: View {
    @State private var extensionState: ExtensionState = .unknown
    @State private var isCheckingState = false

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 28) {
                    // App icon + wordmark
                    VStack(spacing: 12) {
                        Image("AppIcon")
                            .resizable()
                            .frame(width: 80, height: 80)
                            .cornerRadius(18)
                            .shadow(radius: 4)

                        Text("Inkpour")
                            .font(.title)
                            .fontWeight(.bold)

                        Text("Export AI chat conversations to Markdown, DOCX, PDF, JSON, and more — directly from Safari.")
                            .font(.subheadline)
                            .multilineTextAlignment(.center)
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 20)

                    // Status card
                    statusCard

                    // How to use section
                    if extensionState == .enabled {
                        howToUseCard
                    }

                    // Setup instructions
                    if extensionState != .enabled {
                        setupInstructionsCard
                    }

                    // Supported sites
                    supportedSitesCard

                    Spacer(minLength: 20)

                    Link("Privacy Policy", destination: URL(string: "https://github.com/tronicum/inkpour/blob/main/PRIVACY.md")!)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .padding(.bottom, 20)
                }
                .padding(.horizontal, 20)
            }
            .navigationTitle("")
            .navigationBarHidden(true)
        }
        .navigationViewStyle(.stack)
        .onAppear {
            checkExtensionState()
        }
    }

    // MARK: - Subviews

    @ViewBuilder
    private var statusCard: some View {
        GroupBox {
            HStack(spacing: 12) {
                switch extensionState {
                case .enabled:
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                        .font(.title2)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Extension enabled")
                            .fontWeight(.semibold)
                        Text("Inkpour is active in Safari.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                case .disabled:
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundColor(.orange)
                        .font(.title2)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Extension not enabled")
                            .fontWeight(.semibold)
                        Text("Enable Inkpour in Safari settings to get started.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                case .unknown:
                    if isCheckingState {
                        ProgressView()
                    } else {
                        Image(systemName: "questionmark.circle.fill")
                            .foregroundColor(.gray)
                            .font(.title2)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Status unknown")
                                .fontWeight(.semibold)
                            Text("Could not determine extension state.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                Spacer()
            }
        }
    }

    @ViewBuilder
    private var setupInstructionsCard: some View {
        GroupBox(label: Label("How to enable", systemImage: "gear")) {
            VStack(alignment: .leading, spacing: 10) {
                InstructionRow(number: "1", text: "Open the Settings app on your iPhone or iPad")
                InstructionRow(number: "2", text: "Tap Apps → Safari (iOS 18+) or Safari (iOS 17 and earlier)")
                InstructionRow(number: "3", text: "Tap Extensions")
                InstructionRow(number: "4", text: "Find Inkpour and turn it on")
                InstructionRow(number: "5", text: "Tap Inkpour and grant permissions for the AI sites you want to use")
            }
            .padding(.top, 6)

            Button(action: openSafariSettings) {
                Label("Open Safari Settings", systemImage: "arrow.up.right.square")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .padding(.top, 8)
        }
    }

    @ViewBuilder
    private var howToUseCard: some View {
        GroupBox(label: Label("How to use Inkpour", systemImage: "safari")) {
            VStack(alignment: .leading, spacing: 10) {
                InstructionRow(number: "1", text: "Open Safari and navigate to a supported AI chat site")
                InstructionRow(number: "2", text: "Tap the Extensions button (puzzle piece) or the AA button in the address bar")
                InstructionRow(number: "3", text: "Tap Inkpour")
                InstructionRow(number: "4", text: "Choose your export format: Markdown, DOCX, PDF, HTML, JSON, or ZIP")
                InstructionRow(number: "5", text: "The exported file is saved to Files or shared via the share sheet")
            }
            .padding(.top, 6)
        }
    }

    @ViewBuilder
    private var supportedSitesCard: some View {
        GroupBox(label: Label("Supported AI sites", systemImage: "list.bullet")) {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(supportedSites, id: \.self) { site in
                    Text(site)
                        .font(.caption)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 2)
                }
            }
            .padding(.top, 4)
        }
    }

    // MARK: - Data

    private let supportedSites = [
        "ChatGPT", "Claude", "Gemini",
        "AI Studio", "Copilot", "Grok",
        "Perplexity", "DeepSeek", "Meta AI",
        "Mistral", "HuggingChat", "Poe",
        "Phind", "NotebookLM", "Groq",
        "Kagi", "Venice.ai", "Z.ai"
    ]

    // MARK: - Private helpers

    private func checkExtensionState() {
        isCheckingState = true
        SFSafariExtensionManager.getStateOfSafariExtension(
            withIdentifier: "com.inkpour.safari.ios.Extension"
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

    private func openSafariSettings() {
        // Deep-link into Safari's settings page on iOS.
        // "App-prefs:SAFARI" works on iOS 16+ for jumping to Safari settings.
        // Fall back to the general Settings URL if the deep link is unavailable.
        let safariPrefsURL = URL(string: UIApplication.openSettingsURLString)!
        UIApplication.shared.open(safariPrefsURL)
    }
}

// MARK: - ExtensionState

private enum ExtensionState: Equatable {
    case unknown
    case enabled
    case disabled
}

// MARK: - InstructionRow helper

private struct InstructionRow: View {
    let number: String
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(number)
                .font(.caption)
                .fontWeight(.bold)
                .foregroundColor(.white)
                .frame(width: 20, height: 20)
                .background(Color.accentColor)
                .clipShape(Circle())
            Text(text)
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Preview

#Preview {
    ContentView()
}
