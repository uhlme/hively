import UIKit
import Capacitor
import WebKit

/// App entry view controller.
///
/// Supports two launch arguments used by the App Store screenshot UI test:
///   -hively-uitest-seed            seed deterministic demo data before render
///   -hively-uitest-view <name>     open a specific view on launch (dashboard,
///                                  hives, finances, calendar, settings …)
///
/// Both are applied through a document-start user script. Capacitor replaces the
/// `userContentController` it gets from `webViewConfiguration(for:)`, so the
/// script has to be added here, where `configuration.userContentController` is
/// the one the web view is actually created with.
class MainViewController: CAPBridgeViewController {
    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        let args = ProcessInfo.processInfo.arguments
        var lines: [String] = []

        if args.contains("-hively-uitest-seed") {
            lines.append("window.localStorage.setItem('hively_uitest_seed', '1');")
        }
        if let i = args.firstIndex(of: "-hively-uitest-view"), i + 1 < args.count {
            let view = args[i + 1].replacingOccurrences(of: "'", with: "")
            lines.append("history.replaceState(null, '', '/?view=\(view)');")
        }

        if !lines.isEmpty {
            let script = WKUserScript(source: lines.joined(separator: "\n"),
                                      injectionTime: .atDocumentStart,
                                      forMainFrameOnly: true)
            configuration.userContentController.addUserScript(script)
        }
        return super.webView(with: frame, configuration: configuration)
    }
}
