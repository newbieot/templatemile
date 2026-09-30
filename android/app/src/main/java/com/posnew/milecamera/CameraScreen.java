package com.posnew.milecamera;

import android.Manifest;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaActionSound;
import android.util.Rational;
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
import androidx.camera.core.ViewPort;
import androidx.camera.core.resolutionselector.AspectRatioStrategy;
import androidx.camera.core.resolutionselector.ResolutionSelector;
import androidx.camera.core.resolutionselector.ResolutionStrategy;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

final class CameraScreen extends FrameLayout {
    private final ComponentActivity activity;
    private final SessionStore store;
    private final ExecutorService io;
    private final PreviewView preview;
    private final FrameLayout overlays;
    private final View captureFlash;
    private final ExecutorService soundIo=Executors.newSingleThreadExecutor();
    private MediaActionSound shutterSound;
    private final FocusOverlay focusOverlay;
    private final TextView status, counter, zoom, lamp, finish, gallery;
    private final Shutter shutter;
    private ProcessCameraProvider provider;
    private Camera camera;
    private ImageCapture imageCapture;
    private boolean busy, closed, torch, previewReady;
    private int focusRequest;

    CameraScreen(ComponentActivity activity, SessionStore store, ExecutorService io, Runnable home, Runnable openGallery, Runnable process) {
        super(activity);
        this.activity=activity; this.store=store; this.io=io;
        setBackgroundColor(Color.BLACK);
        boolean landscape=activity.getResources().getConfiguration().orientation==Configuration.ORIENTATION_LANDSCAPE;
        int margin=Ui.dp(activity,16), translucent=Color.argb(170,11,21,56);

        // The viewfinder stays behind every control and occupies the entire screen.
        preview=new PreviewView(activity);
        preview.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        preview.setScaleType(PreviewView.ScaleType.FIT_CENTER);
        addView(preview,new LayoutParams(-1,-1));
        focusOverlay=new FocusOverlay(activity);
        addView(focusOverlay,new LayoutParams(-1,-1));
        captureFlash=new View(activity); captureFlash.setBackgroundColor(Color.WHITE);
        captureFlash.setAlpha(0f); captureFlash.setVisibility(View.INVISIBLE);
        captureFlash.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        addView(captureFlash,new LayoutParams(-1,-1));
        soundIo.execute(() -> {
            try { shutterSound=new MediaActionSound(); shutterSound.load(MediaActionSound.SHUTTER_CLICK); }
            catch (RuntimeException ignored) { }
        });
        overlays=new FrameLayout(activity);
        addView(overlays,new LayoutParams(-1,-1));

        View topShade=new View(activity);
        topShade.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{Color.argb(160,0,0,0),Color.TRANSPARENT}));
        overlays.addView(topShade,new LayoutParams(-1,Ui.dp(activity,landscape?100:150),Gravity.TOP));
        View bottomShade=new View(activity);
        bottomShade.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP,new int[]{Color.argb(170,0,0,0),Color.TRANSPARENT}));
        overlays.addView(bottomShade,new LayoutParams(-1,Ui.dp(activity,landscape?90:230),Gravity.BOTTOM));

        LinearLayout header=Ui.row(activity);
        TextView back=Ui.button(activity,"‹",translucent,Color.WHITE,() -> { if (!busy) home.run(); });
        back.setTextSize(28); back.setMinHeight(0); back.setPadding(0,0,0,0);
        back.setContentDescription("Kembali ke beranda");
        header.addView(back,new LinearLayout.LayoutParams(Ui.dp(activity,48),Ui.dp(activity,48)));
        LinearLayout title=Ui.column(activity); title.setPadding(Ui.dp(activity,12),0,0,0);
        TextView heading=Ui.text(activity,"Capture dokumen",landscape?16:18,Color.WHITE,true);
        title.addView(heading);
        counter=Ui.text(activity,"",12,Ui.ACCENT,false); Ui.gap(title,5); title.addView(counter);
        header.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        lamp=Ui.button(activity,"Lampu",translucent,Color.WHITE,this::toggleTorch);
        lamp.setTextSize(12); lamp.setMinHeight(0);
        lamp.setPadding(Ui.dp(activity,14),0,Ui.dp(activity,14),0);
        lamp.setContentDescription("Nyalakan atau matikan lampu kamera");
        header.addView(lamp,new LinearLayout.LayoutParams(-2,Ui.dp(activity,48)));
        LayoutParams headerLayout=new LayoutParams(-1,Ui.dp(activity,52),Gravity.TOP);
        headerLayout.setMargins(margin,Ui.dp(activity,12),margin,0); overlays.addView(header,headerLayout);

        TextView tip=Ui.text(activity,"Ketuk teks untuk fokus",12,Color.WHITE,false);
        tip.setPadding(Ui.dp(activity,14),Ui.dp(activity,8),Ui.dp(activity,14),Ui.dp(activity,8));
        tip.setBackground(Ui.background(translucent,20,activity));
        LayoutParams tipLayout=new LayoutParams(-2,-2,Gravity.TOP|Gravity.CENTER_HORIZONTAL);
        tipLayout.topMargin=Ui.dp(activity,landscape?76:88);
        tipLayout.rightMargin=landscape?Ui.dp(activity,104):0; overlays.addView(tip,tipLayout);

        status=Ui.text(activity,"Menyiapkan kamera…",12,Color.WHITE,false);
        status.setGravity(Gravity.CENTER); status.setMaxLines(2);
        status.setPadding(Ui.dp(activity,12),Ui.dp(activity,8),Ui.dp(activity,12),Ui.dp(activity,8));
        status.setBackground(Ui.background(translucent,18,activity));
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        LayoutParams statusLayout=new LayoutParams(-1,-2,Gravity.BOTTOM);
        statusLayout.setMargins(margin,0,landscape?Ui.dp(activity,128):margin,Ui.dp(activity,landscape?14:146));
        overlays.addView(status,statusLayout);

        zoom=Ui.button(activity,"1×",translucent,Color.WHITE,this::resetZoom);
        zoom.setTextSize(12); zoom.setMinHeight(0); zoom.setPadding(0,0,0,0);
        zoom.setContentDescription("Zoom kamera. Cubit layar untuk mengubah zoom; ketuk untuk kembali ke satu kali.");
        LayoutParams zoomLayout=new LayoutParams(Ui.dp(activity,58),Ui.dp(activity,40),Gravity.BOTTOM|Gravity.CENTER_HORIZONTAL);
        zoomLayout.bottomMargin=Ui.dp(activity,landscape?62:196);
        zoomLayout.rightMargin=landscape?Ui.dp(activity,104):0; overlays.addView(zoom,zoomLayout);

        gallery=Ui.button(activity,"Galeri",translucent,Color.WHITE,() -> { if (!busy) openGallery.run(); });
        gallery.setTextSize(12); gallery.setMinHeight(0);
        gallery.setPadding(Ui.dp(activity,10),0,Ui.dp(activity,10),0);
        shutter=new Shutter(activity); shutter.setContentDescription("Ambil foto dokumen");
        shutter.setFocusable(true); shutter.setClickable(true); shutter.setOnClickListener(v -> capture());
        finish=Ui.button(activity,landscape?"Selesai":"Selesai →",Color.argb(225,37,99,235),Color.WHITE,() -> { if (!busy && store.count()>0) process.run(); });
        finish.setTextSize(12); finish.setMinHeight(0);
        finish.setPadding(Ui.dp(activity,10),0,Ui.dp(activity,10),0);

        if (landscape) {
            LinearLayout controls=Ui.column(activity); controls.setGravity(Gravity.CENTER);
            controls.addView(gallery,new LinearLayout.LayoutParams(-1,Ui.dp(activity,48))); Ui.gap(controls,14);
            LinearLayout.LayoutParams shutterLayout=new LinearLayout.LayoutParams(Ui.dp(activity,76),Ui.dp(activity,76));
            shutterLayout.gravity=Gravity.CENTER_HORIZONTAL; controls.addView(shutter,shutterLayout); Ui.gap(controls,14);
            controls.addView(finish,new LinearLayout.LayoutParams(-1,Ui.dp(activity,48)));
            LayoutParams controlsLayout=new LayoutParams(Ui.dp(activity,96),-1,Gravity.RIGHT);
            controlsLayout.setMargins(0,Ui.dp(activity,76),margin,Ui.dp(activity,10)); overlays.addView(controls,controlsLayout);
        } else {
            LinearLayout controls=Ui.row(activity); controls.setGravity(Gravity.CENTER);
            controls.addView(gallery,new LinearLayout.LayoutParams(0,Ui.dp(activity,52),1));
            LinearLayout.LayoutParams shutterLayout=new LinearLayout.LayoutParams(Ui.dp(activity,78),Ui.dp(activity,78));
            shutterLayout.setMargins(Ui.dp(activity,20),0,Ui.dp(activity,20),0); controls.addView(shutter,shutterLayout);
            controls.addView(finish,new LinearLayout.LayoutParams(0,Ui.dp(activity,52),1));
            LayoutParams controlsLayout=new LayoutParams(-1,Ui.dp(activity,82),Gravity.BOTTOM);
            controlsLayout.setMargins(margin,0,margin,Ui.dp(activity,40)); overlays.addView(controls,controlsLayout);
            TextView caption=Ui.text(activity,"720p · maks. 120 KB per foto",11,Color.WHITE,false); caption.setGravity(Gravity.CENTER);
            LayoutParams captionLayout=new LayoutParams(-1,-2,Gravity.BOTTOM);
            captionLayout.bottomMargin=Ui.dp(activity,18); overlays.addView(caption,captionLayout);
        }

        preview.getPreviewStreamState().observe(activity,state -> {
            if (closed) return;
            previewReady=state==PreviewView.StreamState.STREAMING;
            refresh();
            if (previewReady && !busy && status.getText().toString().equals("Menyiapkan kamera…")) status.setText("Siap capture · ketuk teks untuk fokus");
        });
        refresh();
        GestureDetector taps=new GestureDetector(activity,new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(MotionEvent event) { return true; }
            @Override public boolean onSingleTapUp(MotionEvent event) {
                preview.performClick();
                if (!busy && previewReady && camera!=null) focusAt(event.getX(),event.getY());
                return true;
            }
        });
        ScaleGestureDetector pinch=new ScaleGestureDetector(activity,new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector detector) {
                if (camera==null || busy || closed || camera.getCameraInfo().getZoomState().getValue()==null) return true;
                androidx.camera.core.ZoomState state=camera.getCameraInfo().getZoomState().getValue();
                float ratio=Math.max(state.getMinZoomRatio(),Math.min(state.getMaxZoomRatio(),state.getZoomRatio()*detector.getScaleFactor()));
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

    // Insets move only the controls; the camera surface remains edge to edge.
    void setControlInsets(int left,int top,int right,int bottom) { overlays.setPadding(left,top,right,bottom); }

    private void bindCamera() {
        if (closed || ContextCompat.checkSelfPermission(activity,Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED) return;
        if (preview.getDisplay()==null || preview.getWidth()==0 || preview.getHeight()==0) { preview.postOnAnimation(this::bindCamera); return; }
        ListenableFuture<ProcessCameraProvider> future=ProcessCameraProvider.getInstance(activity);
        future.addListener(() -> {
            if (closed) return;
            try {
                provider=future.get();
                ResolutionSelector selector=new ResolutionSelector.Builder()
                    .setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY)
                    .setResolutionStrategy(new ResolutionStrategy(new android.util.Size(1280,720),ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER)).build();
                Preview live=new Preview.Builder().setResolutionSelector(selector).setTargetRotation(preview.getDisplay().getRotation()).build();
                live.setSurfaceProvider(preview.getSurfaceProvider());
                imageCapture=new ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .setJpegQuality(82).setResolutionSelector(selector).setFlashMode(ImageCapture.FLASH_MODE_OFF)
                    .setTargetRotation(preview.getDisplay().getRotation()).build();
                CameraSelector cameraSelector=provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)?CameraSelector.DEFAULT_BACK_CAMERA:CameraSelector.DEFAULT_FRONT_CAMERA;
                provider.unbindAll();
                UseCaseGroup.Builder group=new UseCaseGroup.Builder().addUseCase(live).addUseCase(imageCapture);
                boolean horizontal=preview.getWidth()>preview.getHeight();
                ViewPort viewport=new ViewPort.Builder(new Rational(horizontal?16:9,horizontal?9:16),preview.getDisplay().getRotation())
                    .setScaleType(ViewPort.FILL_CENTER).build();
                // Keep the full 16:9 frame at 1x, even on screens taller or wider than 16:9.
                group.setViewPort(viewport);
                camera=provider.bindToLifecycle(activity,cameraSelector,group.build());
                camera.getCameraControl().setZoomRatio(1f); zoom.setText("1×");
                lamp.setEnabled(camera.getCameraInfo().hasFlashUnit()); lamp.setAlpha(lamp.isEnabled()?1f:.4f);
                if (previewReady) status.setText("Siap capture · ketuk teks untuk fokus");
                refresh();
            } catch (Exception error) {
                previewReady=false; imageCapture=null; camera=null; refresh();
                status.setText("Kamera belum bisa dibuka. Kembali lalu coba lagi.");
                android.widget.Toast.makeText(activity,"Kamera: "+error.getMessage(),android.widget.Toast.LENGTH_LONG).show();
            }
        },ContextCompat.getMainExecutor(activity));
    }

    private void focusAt(float x,float y) {
        if (camera==null || closed) return;
        final int request=++focusRequest;
        MeteringPoint point=preview.getMeteringPointFactory().createPoint(x,y,.18f);
        FocusMeteringAction autofocus=new FocusMeteringAction.Builder(point,FocusMeteringAction.FLAG_AF).build();
        boolean canFocus=camera.getCameraInfo().isFocusMeteringSupported(autofocus);
        FocusMeteringAction action=new FocusMeteringAction.Builder(point,canFocus?FocusMeteringAction.FLAG_AF|FocusMeteringAction.FLAG_AE:FocusMeteringAction.FLAG_AE)
            .setAutoCancelDuration(3,TimeUnit.SECONDS).build();
        if (!camera.getCameraInfo().isFocusMeteringSupported(action)) {
            status.setText("Kamera ini tidak mendukung fokus pada titik"); focusOverlay.show(x,y,Color.rgb(251,190,91)); return;
        }
        status.setText(canFocus?"Mencari fokus…":"Menyesuaikan cahaya · lensa fokus tetap");
        focusOverlay.show(x,y,Color.rgb(251,190,91));
        try {
            ListenableFuture<FocusMeteringResult> future=camera.getCameraControl().startFocusAndMetering(action);
            future.addListener(() -> {
                if (closed || busy || request!=focusRequest) return;
                try {
                    boolean success=canFocus && future.get().isFocusSuccessful();
                    status.setText(!canFocus?"Cahaya disesuaikan · lensa fokus tetap":success?"Fokus terkunci · siap capture":"Fokus belum terkunci · ubah jarak kamera");
                    focusOverlay.show(x,y,success?Ui.ACCENT:Color.rgb(251,190,91));
                } catch (Exception ignored) {
                    status.setText("Fokus belum terkunci · coba ketuk lagi"); focusOverlay.show(x,y,Color.rgb(251,190,91));
                }
            },ContextCompat.getMainExecutor(activity));
        } catch (Exception error) { status.setText("Fokus tidak tersedia saat ini"); }
    }

    private void capture() {
        if (busy || closed || !previewReady || camera==null || imageCapture==null || store.count()>=SessionStore.MAX_PHOTOS) return;
        busy=true; ++focusRequest; refresh();
        // Continuous autofocus runs while framing; shutter no longer waits for a second focus cycle.
        takePhoto();
    }

    private void showCaptureFeedback() {
        if (closed) return;
        performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY); shutter.flash();
        soundIo.execute(() -> {
            try { if (shutterSound!=null) shutterSound.play(MediaActionSound.SHUTTER_CLICK); }
            catch (RuntimeException ignored) { }
        });
        captureFlash.animate().cancel(); captureFlash.setVisibility(View.VISIBLE); captureFlash.setAlpha(.72f);
        captureFlash.animate().alpha(0f).setDuration(180).withEndAction(() -> captureFlash.setVisibility(View.INVISIBLE)).start();
    }

    private void takePhoto() {
        if (closed || imageCapture==null) { busy=false; return; }
        status.setText("Mengambil foto…");
        final File temporary;
        try { temporary=File.createTempFile("mile-capture-",".jpg",activity.getCacheDir()); }
        catch (Exception error) { busy=false; refresh(); status.setText("Foto tidak dapat disiapkan"); return; }
        try {
            if (preview.getDisplay()!=null) imageCapture.setTargetRotation(preview.getDisplay().getRotation());
            showCaptureFeedback();
            imageCapture.takePicture(new ImageCapture.OutputFileOptions.Builder(temporary).build(),ContextCompat.getMainExecutor(activity),new ImageCapture.OnImageSavedCallback() {
                @Override public void onImageSaved(ImageCapture.OutputFileResults result) {
                    if (!closed) status.setText("Menyimpan foto…");
                    try {
                        io.execute(() -> {
                            Exception failure=null;
                            try { store.add(temporary); } catch (Exception error) { failure=error; }
                            finally { temporary.delete(); }
                            final Exception error=failure;
                            activity.runOnUiThread(() -> {
                                busy=false;
                                if (closed) return;
                                refresh();
                                if (error!=null) { status.setText("Foto gagal disimpan · ambil ulang"); android.widget.Toast.makeText(activity,error.getMessage(),android.widget.Toast.LENGTH_LONG).show(); }
                                else { status.setText("✓ Foto "+store.count()+" tersimpan"); performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY); }
                            });
                        });
                    } catch (java.util.concurrent.RejectedExecutionException error) {
                        temporary.delete(); busy=false;
                        if (!closed) { refresh(); status.setText("Foto gagal disimpan · buka kembali kamera"); }
                    }
                }
                @Override public void onError(ImageCaptureException error) {
                    temporary.delete(); busy=false;
                    if (closed) return;
                    refresh(); status.setText("Capture gagal · coba lagi");
                    android.widget.Toast.makeText(activity,error.getMessage(),android.widget.Toast.LENGTH_LONG).show();
                }
            });
        } catch (Exception error) { temporary.delete(); busy=false; if (!closed) { refresh(); status.setText("Foto tidak dapat disiapkan"); } }
    }

    private void toggleTorch() {
        if (closed || camera==null || !camera.getCameraInfo().hasFlashUnit()) return;
        boolean next=!torch;
        ListenableFuture<Void> future=camera.getCameraControl().enableTorch(next);
        future.addListener(() -> {
            if (closed) return;
            try { future.get(); torch=next; lamp.setText(torch?"Lampu ON":"Lampu"); lamp.setTextColor(torch?Ui.ACCENT:Color.WHITE); }
            catch (Exception ignored) { status.setText("Lampu tidak dapat diubah saat ini"); }
        },ContextCompat.getMainExecutor(activity));
    }
    private void resetZoom() { if (!closed && camera!=null) { camera.getCameraControl().setZoomRatio(1f); zoom.setText("1×"); } }
    private void refresh() {
        counter.setText(String.format(java.util.Locale.ROOT,"%03d foto · 720p",store.count()));
        finish.setEnabled(store.count()>0&&!busy); finish.setAlpha(finish.isEnabled()?1f:.35f);
        gallery.setText("Galeri · "+store.count()); gallery.setEnabled(store.count()>0&&!busy); gallery.setAlpha(gallery.isEnabled()?1f:.45f);
        shutter.setEnabled(!closed&&!busy&&previewReady&&camera!=null&&store.count()<SessionStore.MAX_PHOTOS);
        shutter.setAlpha(shutter.isEnabled()?1f:.45f);
    }
    boolean isBusy() { return busy; }
    void close() {
        if (closed) return;
        closed=true; ++focusRequest; previewReady=false;
        preview.getPreviewStreamState().removeObservers(activity); preview.setOnTouchListener(null);
        focusOverlay.stop();
        captureFlash.animate().cancel();
        soundIo.execute(() -> {
            try { if (shutterSound!=null) shutterSound.release(); }
            catch (RuntimeException ignored) { }
        });
        soundIo.shutdown();
        if (provider!=null) provider.unbindAll(); camera=null; imageCapture=null;
    }

    private static final class Shutter extends View {
        boolean flashing;
        private final Paint pen=new Paint(Paint.ANTI_ALIAS_FLAG);
        Shutter(android.content.Context context) { super(context); }
        void flash() { flashing=true; invalidate(); postDelayed(() -> { flashing=false; invalidate(); },120); }
        @Override protected void onDraw(Canvas canvas) {
            float center=getWidth()/2f, cy=getHeight()/2f, radius=Math.min(center,cy)-Ui.dp(getContext(),3);
            pen.setColor(Ui.ACCENT); pen.setStyle(Paint.Style.STROKE); pen.setStrokeWidth(Ui.dp(getContext(),2));
            canvas.drawCircle(center,cy,radius,pen); pen.setStyle(Paint.Style.FILL); pen.setColor(flashing?Ui.ACCENT:Color.WHITE);
            canvas.drawCircle(center,cy,radius-Ui.dp(getContext(),7),pen);
        }
    }
    private static final class FocusOverlay extends View {
        float x,y; int color; boolean visible;
        private final Paint pen=new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Runnable hide=() -> { visible=false; invalidate(); };
        FocusOverlay(android.content.Context context) { super(context); setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO); }
        void show(float x,float y,int color) { this.x=x; this.y=y; this.color=color; visible=true; removeCallbacks(hide); postDelayed(hide,2200); invalidate(); }
        void stop() { removeCallbacks(hide); visible=false; }
        @Override protected void onDraw(Canvas canvas) {
            if (!visible) return;
            pen.setStyle(Paint.Style.STROKE); pen.setColor(color); pen.setStrokeWidth(Ui.dp(getContext(),2));
            int radius=Ui.dp(getContext(),30); canvas.drawRoundRect(x-radius,y-radius,x+radius,y+radius,Ui.dp(getContext(),10),Ui.dp(getContext(),10),pen);
            canvas.drawCircle(x,y,Ui.dp(getContext(),3),pen);
        }
    }
}
