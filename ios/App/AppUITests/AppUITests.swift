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
        app.launch()

        // The app is a Capacitor WebView app; give the WebView time to load
        // and settle on the dashboard before capturing.
        sleep(3)
        snapshot("01Dashboard")

        // TODO: once stable accessibility identifiers exist for the web
        // content (e.g. via data-testid -> accessibilityIdentifier bridging),
        // add taps here to navigate to further screens, e.g.:
        // app.buttons["nav-hives"].tap()
        // sleep(1)
        // snapshot("02Hives")
    }
}
