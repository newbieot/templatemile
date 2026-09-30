package com.posnew.milecamera;

import android.test.ActivityInstrumentationTestCase2;
import android.os.SystemClock;
import android.view.View;
import java.lang.reflect.Field;
import org.json.JSONObject;

public final class CameraCaptureTest extends ActivityInstrumentationTestCase2<CameraQaActivity> {
    public CameraCaptureTest() { super(CameraQaActivity.class); }
    public void testImmediateFeedbackAnd720pCaptureAtOneX() throws Exception {
        CameraQaActivity activity=getActivity();
        CameraScreen screen=(CameraScreen)field(activity,"camera");
        for(int attempt=0;attempt<200 && !(Boolean)field(screen,"previewReady");attempt++) Thread.sleep(100);
        assertTrue("Preview ready",(Boolean)field(screen,"previewReady"));
        androidx.camera.core.Camera camera=(androidx.camera.core.Camera)field(screen,"camera");
        assertEquals(1f,camera.getCameraInfo().getZoomState().getValue().getZoomRatio(),.001f);
        View preview=(View)field(screen,"preview"); assertEquals(screen.getWidth(),preview.getWidth()); assertEquals(screen.getHeight(),preview.getHeight());
        SessionStore store=(SessionStore)field(activity,"store"); int before=store.count();
        View shutter=(View)field(screen,"shutter"); long start=SystemClock.elapsedRealtime();
        getInstrumentation().runOnMainSync(() -> {
            shutter.performClick();
            try { assertTrue((Boolean)field(screen,"busy")); assertEquals(View.VISIBLE,((View)field(screen,"captureFlash")).getVisibility()); }
            catch(Exception error) { throw new RuntimeException(error); }
        });
        long acceptedMs=SystemClock.elapsedRealtime()-start;
        assertTrue("Immediate feedback without fixed AF wait: "+acceptedMs+"ms",acceptedMs<1000);
        for(int attempt=0;attempt<200 && store.count()==before;attempt++) Thread.sleep(50);
        assertEquals(before+1,store.count());
        JSONObject photo=store.snapshot().getJSONArray("photos").getJSONObject(before);
        assertTrue(photo.getInt("bytes")<=120000); assertTrue(Math.max(photo.getInt("width"),photo.getInt("height"))<=1280); assertTrue(Math.min(photo.getInt("width"),photo.getInt("height"))<=720);
        System.out.println("CAMERA_QA feedback="+acceptedMs+"ms saved="+(SystemClock.elapsedRealtime()-start)+"ms jpeg="+photo.getInt("bytes")+"bytes "+photo.getInt("width")+"x"+photo.getInt("height")+" zoom=1x");
    }
    private static Object field(Object target,String name) throws Exception { Field field=target.getClass().getDeclaredField(name); field.setAccessible(true); return field.get(target); }
}
