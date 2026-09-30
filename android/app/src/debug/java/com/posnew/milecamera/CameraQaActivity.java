package com.posnew.milecamera;

import android.os.Bundle;
import android.content.res.Configuration;
import android.widget.FrameLayout;
import androidx.activity.ComponentActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Debug-only camera hardware harness. Never included in the distributed release APK. */
public final class CameraQaActivity extends ComponentActivity {
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private CameraScreen camera;
    private SessionStore store;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
        try { store=new SessionStore(this); showCamera(); } catch(Exception error) { throw new RuntimeException(error); }
    }
    private void showCamera() {
        if(camera!=null) camera.close();
        camera=new CameraScreen(this,store,io,this::finish,() -> {},() -> {});
        setContentView(camera,new FrameLayout.LayoutParams(-1,-1));
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(camera,(view,insets) -> {
            androidx.core.graphics.Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout());
            camera.setControlInsets(bars.left,bars.top,bars.right,bars.bottom); return insets;
        });
        WindowInsetsControllerCompat bars=WindowCompat.getInsetsController(getWindow(),camera);
        bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); bars.hide(WindowInsetsCompat.Type.systemBars());
    }
    @Override public void onConfigurationChanged(Configuration config) { super.onConfigurationChanged(config); if(camera!=null && !camera.isBusy()) showCamera(); }
    @Override public void onDestroy() { if(camera!=null) camera.close(); io.shutdown(); super.onDestroy(); }
}
