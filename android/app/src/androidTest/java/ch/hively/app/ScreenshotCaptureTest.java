package ch.hively.app;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;
import java.io.File;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Play Store screenshot capture — Android counterpart to {@code AppUITests}.
 *
 * Launches {@link MainActivity} once per screen with Intent extras
 * {@code hively_uitest_seed} + {@code hively_uitest_view}, waits for seeded
 * content, optionally scrolls Settings, and writes PNGs under
 * {@code /data/local/tmp/hively-store-screenshots} for {@code adb pull} /
 * Fastlane.
 *
 * <p>App-scoped {@code Android/data/…} is not readable via {@code adb pull} on
 * API 30+; {@code /data/local/tmp} stays world-accessible on emulators.
 *
 * <p><b>Do not</b> {@code am force-stop} the instrumented package — that tears
 * down the instrumentation connection and surfaces as
 * {@code Process crashed} on CI emulators.
 */
@RunWith(AndroidJUnit4.class)
public class ScreenshotCaptureTest {

    private static final String PACKAGE = "ch.hively.app";
    /** Must match Fastlane {@code android screenshots} pull path. */
    public static final String DEVICE_SCREENSHOT_DIR = "/data/local/tmp/hively-store-screenshots";
    private static final int LAUNCH_TIMEOUT_MS = 60_000;
    private static final int SEED_TIMEOUT_MS = 25_000;
    private static final int SETTLE_MS = 3_000;

    private UiDevice device;
    private Context targetContext;
    private File outDir;

    @Before
    public void setUp() throws Exception {
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        targetContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        outDir = new File(DEVICE_SCREENSHOT_DIR);
        device.executeShellCommand("rm -rf " + DEVICE_SCREENSHOT_DIR);
        device.executeShellCommand("mkdir -p " + DEVICE_SCREENSHOT_DIR);
        device.executeShellCommand("chmod 777 " + DEVICE_SCREENSHOT_DIR);
        assertTrue(
            "could not create screenshot dir " + outDir,
            outDir.mkdirs() || outDir.isDirectory()
        );
    }

    @Test
    public void captureStoreScreenshots() throws Exception {
        String[][] screens = {
            { "01Dashboard", "dashboard", "0" },
            { "02Hives", "hives", "0" },
            { "03Finances", "finances", "0" },
            { "04Calendar", "calendar", "0" },
            { "05Settings", "settings", "1" }
        };

        for (int index = 0; index < screens.length; index++) {
            String name = screens[index][0];
            String view = screens[index][1];
            boolean scrollDown = "1".equals(screens[index][2]);

            // singleTask + CLEAR_TASK recreates MainActivity without killing the
            // instrumentation process (unlike `am force-stop`).
            Intent intent = new Intent(targetContext, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            intent.putExtra(MainActivity.EXTRA_UITEST_SEED, true);
            intent.putExtra(MainActivity.EXTRA_UITEST_VIEW, view);
            targetContext.startActivity(intent);

            assertTrue(
                "App did not enter foreground for " + name,
                device.wait(Until.hasObject(By.pkg(PACKAGE).depth(0)), LAUNCH_TIMEOUT_MS)
            );

            if (index == 0) {
                waitForSeededContent();
            } else {
                Thread.sleep(SETTLE_MS);
            }

            if (scrollDown) {
                int midX = device.getDisplayWidth() / 2;
                int fromY = (int) (device.getDisplayHeight() * 0.75);
                int toY = (int) (device.getDisplayHeight() * 0.25);
                for (int swipe = 0; swipe < 6; swipe++) {
                    device.swipe(midX, fromY, midX, toY, 20);
                    Thread.sleep(400);
                }
                Thread.sleep(800);
            }

            File dest = new File(outDir, name + ".png");
            boolean captured = device.takeScreenshot(dest);
            if (!captured || !dest.isFile() || dest.length() == 0) {
                // Fallback: shell screencap (shell user can always write /data/local/tmp).
                device.executeShellCommand("screencap -p " + dest.getAbsolutePath());
            }
            device.executeShellCommand("chmod 644 " + dest.getAbsolutePath());
            assertTrue(
                "screenshot missing for " + name + " at " + dest.getAbsolutePath(),
                dest.isFile() && dest.length() > 0
            );
        }

        File[] written = outDir.listFiles((dir, fileName) -> fileName.endsWith(".png"));
        assertNotNull(written);
        assertTrue("expected 5 screenshots, got " + written.length, written.length >= 5);
    }

    private void waitForSeededContent() throws InterruptedException {
        String[] candidates = { "Volk 1", "Volk 2", "Volk 3", "Hauptstand Talwiese" };
        long deadline = System.currentTimeMillis() + SEED_TIMEOUT_MS;
        while (System.currentTimeMillis() < deadline) {
            for (String text : candidates) {
                if (device.hasObject(By.textContains(text))) {
                    Thread.sleep(1000);
                    return;
                }
            }
            Thread.sleep(500);
        }
        // Fallback: WebView accessibility tree may not expose labels on some APIs.
        Thread.sleep(4000);
    }
}
