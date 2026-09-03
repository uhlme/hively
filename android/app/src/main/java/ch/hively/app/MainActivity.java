package ch.hively.app;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import java.util.Collections;

/**
 * Capacitor entry activity.
 *
 * Supports two Intent extras used by the Play Store screenshot instrumentation
 * test (mirrors iOS {@code MainViewController} launch arguments):
 *
 * <ul>
 *   <li>{@code hively_uitest_seed} (boolean or {@code "1"}) — seed demo data
 *       before the web app renders</li>
 *   <li>{@code hively_uitest_view} (string) — open a specific view on launch
 *       ({@code dashboard}, {@code hives}, {@code finances}, {@code calendar},
 *       {@code settings}, …)</li>
 * </ul>
 *
 * Both are applied through a document-start script so {@code src/devSeed.js}
 * and the {@code ?view=} router in {@code src/main.js} see them on first paint
 * after a controlled reload.
 *
 * <p><b>Debug builds only</b> — release/production ignores these extras so a
 * third-party Intent cannot wipe the user's local data via the demo seed.
 */
public class MainActivity extends BridgeActivity {

    public static final String EXTRA_UITEST_SEED = "hively_uitest_seed";
    public static final String EXTRA_UITEST_VIEW = "hively_uitest_view";

    private boolean uiTestHooksApplied = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyUiTestHooks(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // Force-stop + new process is the normal screenshot path; onNewIntent
        // only matters for singleTask re-entry — re-apply when extras change.
        uiTestHooksApplied = false;
        applyUiTestHooks(intent);
    }

    private boolean isDebuggable() {
        return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private void applyUiTestHooks(Intent intent) {
        if (intent == null || getBridge() == null || !isDebuggable() || uiTestHooksApplied) {
            return;
        }

        boolean seed =
            intent.getBooleanExtra(EXTRA_UITEST_SEED, false)
                || "1".equals(intent.getStringExtra(EXTRA_UITEST_SEED));
        String view = intent.getStringExtra(EXTRA_UITEST_VIEW);
        if (view != null) {
            view = view.replace("'", "").replace("\"", "").trim();
        }
        boolean hasView = view != null && !view.isEmpty();
        if (!seed && !hasView) {
            return;
        }

        StringBuilder script = new StringBuilder();
        if (seed) {
            script.append("window.localStorage.setItem('hively_uitest_seed','1');");
        }
        if (hasView) {
            script
                .append("history.replaceState(null,'','/?view=")
                .append(view)
                .append("');");
        }

        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }

        final String js = script.toString();
        final String safeView = hasView ? view : null;
        uiTestHooksApplied = true;

        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(
                webView,
                js,
                Collections.singleton("*")
            );
            // Reload so the document-start script runs before app JS on the
            // next navigation (seed + ?view= visible to DOMContentLoaded).
            webView.post(webView::reload);
            return;
        }

        // Older WebView: set localStorage, then navigate so ?view= sticks.
        webView.post(() -> {
            String navigate =
                safeView != null
                    ? "window.location.replace('/?view=" + safeView + "');"
                    : "window.location.reload();";
            webView.evaluateJavascript(js + navigate, null);
        });
    }
}
