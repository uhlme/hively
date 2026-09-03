//
//  AppUITests.swift
//  AppUITests
//

import XCTest

final class AppUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testScreenshots() throws {
        let app = XCUIApplication()
        setupSnapshot(app)
        app.launchArguments += ["-AppleLanguages", "(de-DE)", "-AppleLocale", "de_DE"]
        // Ask the native MainViewController to seed deterministic demo data so
        // the store screenshots show a populated app instead of an empty state.
        app.launchArguments += ["-hively-uitest-seed"]
        app.launch()

        let webView = app.webViews.firstMatch
        XCTAssertTrue(webView.waitForExistence(timeout: 30), "WebView did not load")

        // Wait until seeded content is rendered on the dashboard before capturing.
        waitForSeededContent(in: app)

        // 1) Dashboard – overview with hives, honey and finances.
        snapshot("01Dashboard")

        // 2) Inspection – open the "Durchsicht" modal from the dashboard.
        if tapWebButton(in: app, labelContains: "Durchsicht") {
            _ = app.webViews.firstMatch.waitForExistence(timeout: 5)
            sleep(2)
            snapshot("02Inspection")
            // Close the modal before moving on.
            tapWebButton(in: app, labelContains: "×")
            sleep(1)
        }

        // 3) Finances – bottom-nav "Finanzen".
        if tapWebButton(in: app, labelContains: "Finanzen") {
            sleep(2)
            snapshot("03Finances")
        }

        // 4) Apiaries – open Settings, scroll to the "Bienenstände" section.
        if tapWebButton(in: app, labelContains: "Einstellungen") {
            sleep(2)
            snapshot("04Apiaries")

            // 5) Offline / local data – scroll further down within Settings.
            webView.swipeUp()
            webView.swipeUp()
            sleep(1)
            snapshot("05Offline")
        }
    }

    // MARK: - Helpers

    /// Poll for any known seeded label so we capture a populated UI.
    @MainActor
    private func waitForSeededContent(in app: XCUIApplication) {
        let candidates = ["Volk 1", "Hauptstand Talwiese", "Volk 2"]
        let deadline = Date().addingTimeInterval(20)
        while Date() < deadline {
            for text in candidates where app.webViews.staticTexts[text].exists {
                sleep(1)
                return
            }
            usleep(500_000)
        }
        // Fall back to a fixed settle time if labels are not exposed to a11y.
        sleep(3)
    }

    /// Tap the first web element whose accessibility label contains `labelContains`.
    /// Tries buttons, links and static texts (WKWebView exposes them differently).
    @discardableResult
    @MainActor
    private func tapWebButton(in app: XCUIApplication, labelContains: String) -> Bool {
        let predicate = NSPredicate(format: "label CONTAINS[c] %@", labelContains)
        let webView = app.webViews.firstMatch

        for query in [webView.buttons, webView.links, webView.staticTexts] {
            let element = query.matching(predicate).firstMatch
            if element.waitForExistence(timeout: 5) {
                element.tap()
                return true
            }
        }
        return false
    }
}
