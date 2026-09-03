import UIKit
import Capacitor
import WebKit

/// App entry view controller.
///
/// When launched with the `-hively-uitest-seed` argument (used by the App Store
/// screenshot UI test), a document-start user script sets a localStorage flag so
/// the web app seeds deterministic demo data before it renders.
class MainViewController: CAPBridgeViewController {
    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        if ProcessInfo.processInfo.arguments.contains("-hively-uitest-seed") {
            let source = "window.localStorage.setItem('hively_uitest_seed', '1');"
            let script = WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            configuration.userContentController.addUserScript(script)
        }
        return configuration
    }
}
