fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios screenshots

```sh
[bundle exec] fastlane ios screenshots
```

Capture App Store screenshots via the AppUITests target

### ios frame_shots

```sh
[bundle exec] fastlane ios frame_shots
```

Add device frames + ASO overlay text to captured screenshots (frameit)

### ios verify_existing_screenshots

```sh
[bundle exec] fastlane ios verify_existing_screenshots
```

Fail unless committed iOS screenshots exist under fastlane/screenshots/ (no capture)

### ios upload_metadata

```sh
[bundle exec] fastlane ios upload_metadata
```

Upload App Store listing text + age rating from the repo (no binary)

### ios upload_privacy

```sh
[bundle exec] fastlane ios upload_privacy
```

Upload App Privacy Labels from fastlane/app_privacy_details.json (Apple ID session, not API key)

### ios beta

```sh
[bundle exec] fastlane ios beta
```

Build the iOS app and upload it to TestFlight

----


## Android

### android verify_existing_screenshots

```sh
[bundle exec] fastlane android verify_existing_screenshots
```

Stage committed Android screenshots into Play phoneScreenshots/ (no capture)

### android screenshots

```sh
[bundle exec] fastlane android screenshots
```

Capture Play Store phone screenshots via ScreenshotCaptureTest (needs emulator/device)

### android frame_shots

```sh
[bundle exec] fastlane android frame_shots
```

Add device frames + ASO overlay text, copy into Play phoneScreenshots/

### android upload_metadata

```sh
[bundle exec] fastlane android upload_metadata
```

Upload Play Store listing text from fastlane/metadata/android/ (no binary)

### android beta

```sh
[bundle exec] fastlane android beta
```

Build the Android app and upload it to the Play Store internal testing track

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
