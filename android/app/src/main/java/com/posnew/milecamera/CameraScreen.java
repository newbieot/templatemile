package com.posnew.milecamera;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.ComponentActivity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.FocusMeteringAction;
import androidx.camera.core.FocusMeteringResult;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.MeteringPoint;
import androidx.camera.core.Preview;
import androidx.camera.core.UseCaseGroup;
import androidx.camera.core.resolutionselector.AspectRatioStrategy;
import androidx.camera.core.resolutionselector.ResolutionSelector;
import androidx.camera.core.resolutionselector.ResolutionStrategy;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

final class CameraScreen extends LinearLayout {
    private final ComponentActivity activity;
    private final SessionStore store;
    private final ExecutorService io;
    private final PreviewView preview;
    private final FocusOverlay focusOverlay;
    private final TextView status, counter, zoom, lamp, finish, gallery;
    private final Shutter shutter;
    private ProcessCameraProvider provider;
    private Camera camera;
    private ImageCapture imageCapture;
    private boolean busy, closed, torch;
    private float focusX = -1, focusY = -1;

    CameraScreen(ComponentActivity activity, SessionStore store, ExecutorService io, Runnable home, Runnable openGallery, Runnable process) {
        super(activity);
        this.activity = activity; this.store = store; this.io = io;
        setOrientation(VERTICAL); setBackgroundColor(Ui.DARK);
        int margin = Ui.dp(activity, 20);
        LinearLayout header = Ui.row(activity); header.setPadding(margin, Ui.dp(activity,12), margin, Ui.dp(activity,12));
        TextView back = Ui.button(activity,"‹",Ui.PANEL,Color.WHITE,() -> { if (!busy) home.run(); });
        back.setTextSize(28); back.setContentDescription("Kembali ke beranda");
        header.addView(back,new LayoutParams(Ui.dp(activity,48),Ui.dp(activity,48)));
        LinearLayout title = Ui.column(activity); title.setPadding(Ui.dp(activity,14),0,0,0);
        title.addView(Ui.text(activity,"Capture dokumen",18,Color.WHITE,true));
        counter = Ui.text(activity,"",12,Ui.ACCENT,false); Ui.gap(title,5); title.addView(counter);
        header.addView(title,new LayoutParams(0,-2,1));
        lamp = Ui.button(activity,"Lampu",Ui.PANEL,Color.WHITE,this::toggleTorch);
        lamp.setTextSize(12); lamp.setContentDescription("Nyalakan atau matikan lampu kamera");
        header.addView(lamp,new LayoutParams(-2,Ui.dp(activity,48))); addView(header,Ui.matchWrap());

        FrameLayout viewfinder = new FrameLayout(activity);
        preview = new PreviewView(activity);
        preview.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        preview.setScaleType(PreviewView.ScaleType.FIT_CENTER);
        viewfinder.addView(preview,new FrameLayout.LayoutParams(-1,-1));
        focusOverlay = new FocusOverlay(activity);
        viewfinder.addView(focusOverlay,new FrameLayout.LayoutParams(-1,-1));
        TextView tip = Ui.text(activity,"Ketuk teks untuk fokus",12,Color.WHITE,false);
        tip.setPadding(Ui.dp(activity,14),Ui.dp(activity,8),Ui.dp(activity,14),Ui.dp(activity,8));
        tip.setBackground(Ui.background(Color.argb(180,11,21,56),20,activity));
        FrameLayout.LayoutParams tipLayout = new FrameLayout.LayoutParams(-2,-2,Gravity.TOP|Gravity.CENTER_HORIZONTAL); tipLayout.topMargin=Ui.dp(activity,12);
        viewfinder.addView(tip,tipLayout);
        zoom = Ui.button(activity,"1×",Color.argb(220,29,52,112),Color.WHITE,this::resetZoom);
        zoom.setTextSize(12); zoom.setMinHeight(0);
        zoom.setContentDescription("Zoom kamera. Cubit layar untuk mengubah zoom; ketuk untuk kembali ke satu kali.");
        FrameLayout.LayoutParams zoomLayout = new FrameLayout.LayoutParams(Ui.dp(activity,64),Ui.dp(activity,42),Gravity.BOTTOM|Gravity.CENTER_HORIZONTAL); zoomLayout.bottomMargin=Ui.dp(activity,12);
        viewfinder.addView(zoom,zoomLayout); addView(viewfinder,new LayoutParams(-1,0,1));

        LinearLayout dock = Ui.column(activity); dock.setPadding(margin,Ui.dp(activity,10),margin,Ui.dp(activity,14));
        status = Ui.text(activity,"Menyiapkan kamera…",13,Ui.ACCENT,false); status.setGravity(Gravity.CENTER); status.setMinHeight(Ui.dp(activity,24));
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        dock.addView(status,Ui.matchWrap()); Ui.gap(dock,10);
        LinearLayout controls = Ui.row(activity); controls.setGravity(Gravity.CENTER);
        gallery = Ui.button(activity,"Galeri",Ui.PANEL,Color.WHITE,() -> { if (!busy) openGallery.run(); });
        gallery.setTextSize(13); controls.addView(gallery,new LayoutParams(0,Ui.dp(activity,58),1));
        shutter = new Shutter(activity); shutter.setContentDescription("Ambil foto dokumen"); shutter.setFocusable(true); shutter.setClickable(true);
        shutter.setOnClickListener(v -> capture());
        LayoutParams shutterLayout = new LayoutParams(Ui.dp(activity,78),Ui.dp(activity,78)); shutterLayout.setMargins(Ui.dp(activity,22),0,Ui.dp(activity,22),0); controls.addView(shutter,shutterLayout);
        finish = Ui.button(activity,"Selesai →",Ui.BLUE,Color.WHITE,() -> { if (!busy && store.count()>0) process.run(); });
        finish.setTextSize(13); controls.addView(finish,new LayoutParams(0,Ui.dp(activity,58),1));
        dock.addView(controls,Ui.matchWrap()); Ui.gap(dock,8);
        TextView caption = Ui.text(activity,"Foto asli tersimpan di HP",11,Color.rgb(148,163,184),false); caption.setGravity(Gravity.CENTER); dock.addView(caption,Ui.matchWrap());
        addView(dock,Ui.matchWrap());
        if (activity.getResources().getConfiguration().orientation==android.content.res.Configuration.ORIENTATION_LANDSCAPE) {
            // A side dock leaves enough room for the document on a landscape holder.
            removeAllViews(); setOrientation(HORIZONTAL);
            LinearLayout left=Ui.column(activity);
            left.addView(header,Ui.matchWrap()); left.addView(viewfinder,new LayoutParams(-1,0,1));
            addView(left,new LayoutParams(0,-1,1));
            dock.removeAllViews(); controls.removeAllViews();
            dock.setGravity(Gravity.CENTER); dock.setPadding(Ui.dp(activity,12),Ui.dp(activity,8),Ui.dp(activity,12),Ui.dp(activity,8));
            dock.addView(status,Ui.matchWrap()); Ui.gap(dock,8);
            LayoutParams centeredShutter=new LayoutParams(Ui.dp(activity,78),Ui.dp(activity,78)); centeredShutter.gravity=Gravity.CENTER_HORIZONTAL;
            dock.addView(shutter,centeredShutter); Ui.gap(dock,10);
            dock.addView(gallery,new LayoutParams(-1,Ui.dp(activity,48))); Ui.gap(dock,8);
            dock.addView(finish,new LayoutParams(-1,Ui.dp(activity,48))); Ui.gap(dock,8);
            dock.addView(caption,Ui.matchWrap()); addView(dock,new LayoutParams(Ui.dp(activity,176),-1));
        }
        refresh();

        GestureDetector taps = new GestureDetector(activity,new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(MotionEvent event) { return true; }
            @Override public boolean onSingleTapUp(MotionEvent event) {
                preview.performClick();
                if (!busy && camera != null) focusAt(event.getX(),event.getY(),null);
                return true;
            }
        });
        ScaleGestureDetector pinch = new ScaleGestureDetector(activity,new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector detector) {
                if (camera == null || busy || camera.getCameraInfo().getZoomState().getValue() == null) return true;
                androidx.camera.core.ZoomState state = camera.getCameraInfo().getZoomState().getValue();
                float ratio = Math.max(state.getMinZoomRatio(),Math.min(state.getMaxZoomRatio(),state.getZoomRatio()*detector.getScaleFactor()));
                camera.getCameraControl().setZoomRatio(ratio);
                zoom.setText(String.format(java.util.Locale.ROOT,"%.1f×",ratio)); return true;
            }
        });
        preview.setOnTouchListener((v,event) -> {
            pinch.onTouchEvent(event);
            if (!pinch.isInProgress()) taps.onTouchEvent(event);
            return true;
        });
        preview.post(this::bindCamera);
    }

    private void bindCamera() {
        if (closed || ContextCompat.checkSelfPermission(activity,Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED) return;
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(activity);
        future.addListener(() -> {
            if (closed) return;
            try {
                provider = future.get();
                ResolutionSelector selector = new ResolutionSelector.Builder()
                    .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                    .setResolutionStrategy(new ResolutionStrategy(new android.util.Size(2048,1536),ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER)).build();
                Preview live = new Preview.Builder().setResolutionSelector(new ResolutionSelector.Builder()
                    .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY).build()).build();
                live.setSurfaceProvider(preview.getSurfaceProvider());
                imageCapture = new ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                    .setJpegQuality(94).setResolutionSelector(selector).setFlashMode(ImageCapture.FLASH_MODE_OFF).build();
                imageCapture.setTargetRotation(preview.getDisplay().getRotation());
                CameraSelector cameraSelector = provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) ? CameraSelector.DEFAULT_BACK_CAMERA : CameraSelector.DEFAULT_FRONT_CAMERA;
                provider.unbindAll();
                // Both streams show the complete 4:3 image; FIT_CENTER avoids hidden crop.
                camera = provider.bindToLifecycle(activity,cameraSelector,new UseCaseGroup.Builder().addUseCase(live).addUseCase(imageCapture).build());
                lamp.setEnabled(camera.getCameraInfo().hasFlashUnit()); lamp.setAlpha(lamp.isEnabled()?1f:.4f);
                status.setText("Autofokus aktif · ketuk untuk fokus");
                shutter.setEnabled(true);
                preview.postDelayed(() -> { if (!closed && camera != null) focusAt(preview.getWidth()/2f,preview.getHeight()/2f,null); },600);
            } catch (Exception error) {
                status.setText("Kamera belum bisa dibuka. Kembali lalu coba lagi.");
                shutter.setEnabled(false);
                android.widget.Toast.makeText(activity,"Kamera: " + error.getMessage(),android.widget.Toast.LENGTH_LONG).show();
            }
        },ContextCompat.getMainExecutor(activity));
    }

    private void focusAt(float x,float y,Runnable after) {
        if (camera == null || closed) { if (after != null) after.run(); return; }
        focusX=x; focusY=y;
        MeteringPoint point = preview.getMeteringPointFactory().createPoint(x,y,.18f);
        FocusMeteringAction autofocus = new FocusMeteringAction.Builder(point,FocusMeteringAction.FLAG_AF).build();
        boolean canFocus = camera.getCameraInfo().isFocusMeteringSupported(autofocus);
        FocusMeteringAction action = new FocusMeteringAction.Builder(point,canFocus ? FocusMeteringAction.FLAG_AF|FocusMeteringAction.FLAG_AE : FocusMeteringAction.FLAG_AE)
            .setAutoCancelDuration(3,TimeUnit.SECONDS).build();
        if (!camera.getCameraInfo().isFocusMeteringSupported(action)) {
            status.setText("Kamera ini tidak mendukung fokus pada titik");
            focusOverlay.show(x,y,Color.rgb(251,190,91));
            if (after != null) after.run(); return;
        }
        status.setText(canFocus ? "Mencari fokus…" : "Menyesuaikan cahaya · lensa fokus tetap");
        focusOverlay.show(x,y,Color.rgb(251,190,91));
        try {
            ListenableFuture<FocusMeteringResult> future = camera.getCameraControl().startFocusAndMetering(action);
            AtomicBoolean continued = new AtomicBoolean(false);
            Runnable proceed = () -> { if (after != null && continued.compareAndSet(false,true) && !closed) after.run(); };
            if (after != null) postDelayed(proceed,1600);
            future.addListener(() -> {
                if (closed) return;
                try {
                    boolean success = canFocus && future.get().isFocusSuccessful();
                    status.setText(!canFocus ? "Cahaya disesuaikan · lensa fokus tetap" : success ? "Fokus terkunci · siap capture" : "Fokus belum terkunci · ubah jarak kamera");
                    focusOverlay.show(x,y,success ? Ui.ACCENT : Color.rgb(251,190,91));
                } catch (Exception ignored) {
                    status.setText("Fokus belum terkunci · coba ketuk lagi");
                    focusOverlay.show(x,y,Color.rgb(251,190,91));
                }
                proceed.run();
            },ContextCompat.getMainExecutor(activity));
        } catch (Exception error) { status.setText("Fokus tidak tersedia saat ini"); if (after != null) after.run(); }
    }

    private void capture() {
        if (busy || closed || camera==null || imageCapture==null || store.count()>=SessionStore.MAX_PHOTOS) return;
        busy=true; refresh(); performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY);
        focusAt(focusX<0 ? preview.getWidth()/2f : focusX,focusY<0 ? preview.getHeight()/2f : focusY,this::takePhoto);
    }
    private void takePhoto() {
        if (closed) { busy=false; return; }
        status.setText("Mengambil foto…");
        try {
            imageCapture.setTargetRotation(preview.getDisplay().getRotation());
            File temporary = File.createTempFile("mile-capture-",".jpg",activity.getCacheDir());
            imageCapture.takePicture(new ImageCapture.OutputFileOptions.Builder(temporary).build(),ContextCompat.getMainExecutor(activity),new ImageCapture.OnImageSavedCallback() {
                @Override public void onImageSaved(ImageCapture.OutputFileResults result) {
                    status.setText("Menyimpan foto…");
                    io.execute(() -> {
                        Exception failure=null;
                        try { store.add(temporary); } catch (Exception error) { failure=error; }
                        finally { temporary.delete(); }
                        final Exception error=failure;
                        activity.runOnUiThread(() -> {
                            busy=false;
                            if (closed) return;
                            refresh();
                            if (error != null) { status.setText("Foto gagal disimpan · ambil ulang"); android.widget.Toast.makeText(activity,error.getMessage(),android.widget.Toast.LENGTH_LONG).show(); }
                            else { status.setText("✓ Foto " + store.count() + " tersimpan"); performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY); shutter.flash(); }
                        });
                    });
                }
                @Override public void onError(ImageCaptureException error) {
                    temporary.delete(); busy=false; refresh(); status.setText("Capture gagal · coba lagi");
                    android.widget.Toast.makeText(activity,error.getMessage(),android.widget.Toast.LENGTH_LONG).show();
                }
            });
        } catch (Exception error) { busy=false; refresh(); status.setText("Foto tidak dapat disiapkan"); }
    }
    private void toggleTorch() {
        if (camera==null || !camera.getCameraInfo().hasFlashUnit()) return;
        boolean next=!torch;
        ListenableFuture<Void> future=camera.getCameraControl().enableTorch(next);
        future.addListener(() -> {
            try { future.get(); torch=next; lamp.setText(torch?"Lampu ON":"Lampu"); lamp.setTextColor(torch?Ui.ACCENT:Color.WHITE); }
            catch (Exception ignored) { status.setText("Lampu tidak dapat diubah saat ini"); }
        },ContextCompat.getMainExecutor(activity));
    }
    private void resetZoom() { if (camera != null) { camera.getCameraControl().setZoomRatio(1f); zoom.setText("1×"); } }
    private void refresh() {
        counter.setText(String.format(java.util.Locale.ROOT,"%03d foto · batch tersimpan",store.count()));
        finish.setEnabled(store.count()>0&&!busy); finish.setAlpha(finish.isEnabled()?1f:.35f);
        gallery.setText("Galeri · " + store.count()); gallery.setEnabled(store.count()>0&&!busy); gallery.setAlpha(gallery.isEnabled()?1f:.45f);
        shutter.setEnabled(!busy&&store.count()<SessionStore.MAX_PHOTOS); shutter.setAlpha(shutter.isEnabled()?1f:.45f);
    }
    boolean isBusy() { return busy; }
    void close() { closed=true; if (provider!=null) provider.unbindAll(); camera=null; }

    private static final class Shutter extends View {
        boolean flashing;
        Shutter(android.content.Context context) { super(context); }
        void flash() { flashing=true; invalidate(); postDelayed(() -> { flashing=false; invalidate(); },160); }
        @Override protected void onDraw(Canvas canvas) {
            float center=getWidth()/2f, cy=getHeight()/2f, radius=Math.min(center,cy)-Ui.dp(getContext(),3);
            Paint pen=new Paint(Paint.ANTI_ALIAS_FLAG); pen.setColor(Ui.ACCENT); pen.setStyle(Paint.Style.STROKE); pen.setStrokeWidth(Ui.dp(getContext(),2));
            canvas.drawCircle(center,cy,radius,pen); pen.setStyle(Paint.Style.FILL); pen.setColor(flashing?Ui.ACCENT:Color.WHITE); canvas.drawCircle(center,cy,radius-Ui.dp(getContext(),7),pen);
        }
    }
    private static final class FocusOverlay extends View {
        float x,y; int color; boolean visible;
        private final Runnable hide=() -> { visible=false; invalidate(); };
        FocusOverlay(android.content.Context context) { super(context); setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO); }
        void show(float x,float y,int color) { this.x=x; this.y=y; this.color=color; visible=true; removeCallbacks(hide); postDelayed(hide,2200); invalidate(); }
        @Override protected void onDraw(Canvas canvas) {
            if (!visible) return;
            Paint pen=new Paint(Paint.ANTI_ALIAS_FLAG); pen.setStyle(Paint.Style.STROKE); pen.setColor(color); pen.setStrokeWidth(Ui.dp(getContext(),2));
            int radius=Ui.dp(getContext(),30); canvas.drawRoundRect(x-radius,y-radius,x+radius,y+radius,Ui.dp(getContext(),10),Ui.dp(getContext(),10),pen);
            canvas.drawCircle(x,y,Ui.dp(getContext(),3),pen);
        }
    }
}
