//
//  AppUITests.swift
//  AppUITests
//

import XCTest

final class AppUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    @MainActor
    func testScreenshots() throws {
        // Screen name -> app view (see MainViewController / src/main.js router).
        let screens: [(name: String, view: String, scrollDown: Bool)] = [
            ("01Dashboard", "dashboard", false),
            ("02Hives",     "hives",     false),
            ("03Finances",  "finances",  false),
            ("04Calendar",  "calendar",  false),
            ("05Settings",  "settings",  true)
        ]

        let app = XCUIApplication()
        setupSnapshot(app)

        for (index, screen) in screens.enumerated() {
            app.launchArguments = [
                "-AppleLanguages", "(de-DE)",
                "-AppleLocale", "de_DE",
                "-hively-uitest-seed",
                "-hively-uitest-view", screen.view
            ]
            app.launch()

            let webView = app.webViews.firstMatch
            XCTAssertTrue(webView.waitForExistence(timeout: 60), "WebView did not load for \(screen.name)")

            // First launch seeds localStorage; wait for the seeded UI to render.
            if index == 0 {
                waitForSeededContent(in: app)
            } else {
                sleep(3)
            }

            if screen.scrollDown {
                // Scroll to the offline / local-data block near the bottom of
                // Settings. Stop once the reset button is on screen (or after a
                // bounded number of swipes) so iPhone and iPad land similarly.
                let target = webView.buttons["Lokale Daten löschen"]
                var swipes = 0
                while !target.isHittable && swipes < 6 {
                    webView.swipeUp()
                    swipes += 1
                }
                sleep(1)
            }

            snapshot(screen.name)
            app.terminate()
        }
    }

    // MARK: - Helpers

    /// Poll for any known seeded label so we capture a populated UI.
    @MainActor
    private func waitForSeededContent(in app: XCUIApplication) {
        let candidates = ["Volk 1", "Volk 2", "Volk 3", "Hauptstand Talwiese"]
        let deadline = Date().addingTimeInterval(25)
        while Date() < deadline {
            for text in candidates where app.webViews.staticTexts[text].firstMatch.exists {
                sleep(1)
                return
            }
            usleep(500_000)
        }
        sleep(4)
    }
}
