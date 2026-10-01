package com.posnew.milecamera;

import android.test.ActivityInstrumentationTestCase2;
import android.os.SystemClock;
import android.view.View;
import java.lang.reflect.Field;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

public final class CameraCaptureTest extends ActivityInstrumentationTestCase2<CameraQaActivity> {
    public CameraCaptureTest() { super(CameraQaActivity.class); }
    public void testImmediateFeedbackAnd720pCaptureAtOneX() throws Exception {
        CameraQaActivity activity=getActivity();
        CameraScreen screen=(CameraScreen)field(activity,"camera");
        View shutter=(View)field(screen,"shutter");
        for(int attempt=0;attempt<200 && !shutter.isEnabled();attempt++) Thread.sleep(100);
        assertTrue("Preview ready",(Boolean)field(screen,"previewReady"));
        androidx.camera.core.Camera camera=(androidx.camera.core.Camera)field(screen,"camera");
        assertEquals(1f,camera.getCameraInfo().getZoomState().getValue().getZoomRatio(),.001f);
        View preview=(View)field(screen,"preview"); assertEquals(screen.getWidth(),preview.getWidth()); assertEquals(screen.getHeight(),preview.getHeight());
        SessionStore store=(SessionStore)field(activity,"store"); store.reset(); int before=store.count();
        long start=SystemClock.elapsedRealtime();
        getInstrumentation().runOnMainSync(() -> {
            shutter.performClick();
            try { assertTrue((Boolean)field(screen,"busy")); assertTrue((Boolean)field(field(screen,"shutter"),"flashing")); }
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
    public void testRapidRepeatedCapturePersistsEveryPhotoInOrder() throws Exception {
        CameraQaActivity activity=getActivity();
        CameraScreen screen=(CameraScreen)field(activity,"camera");
        View shutter=(View)field(screen,"shutter");
        for(int attempt=0;attempt<200 && !shutter.isEnabled();attempt++) Thread.sleep(100);
        assertTrue("Preview ready",(Boolean)field(screen,"previewReady"));
        SessionStore store=(SessionStore)field(activity,"store"); store.reset();
        ShutterFrameBuffer frames=(ShutterFrameBuffer)field(screen,"frames");
        for(int i=0;i<3;i++) {
            // Check on the UI thread at touch time, not a stale View flag read on the test
            // thread. Slow virtual sensors can let that flag age while the test is scheduled.
            final boolean[] accepted={false};
            for(int attempt=0;attempt<200 && !accepted[0];attempt++) {
                getInstrumentation().runOnMainSync(() -> {
                    if(!shutter.isEnabled() || !frames.available(SystemClock.elapsedRealtimeNanos()+20_000_000L))return;
                    try {
                        long before=(Long)field(screen,"nextCaptureSequence");
                        shutter.performClick();
                        accepted[0]=(Long)field(screen,"nextCaptureSequence")==before+1;
                    } catch(Exception error) {throw new RuntimeException(error);}
                });
                if(!accepted[0])Thread.sleep(20);
            }
            assertTrue("A shutter with a fresh frame is accepted",accepted[0]);
        }
        for(int attempt=0;attempt<400 && store.count()<3;attempt++) Thread.sleep(50);
        assertEquals("All rapid captures must persist",3,store.count());
        org.json.JSONArray photos=store.snapshot().getJSONArray("photos");
        Set<String> captureIds=new HashSet<>();
        for(int i=0;i<photos.length();i++) {
            JSONObject photo=photos.getJSONObject(i);
            assertEquals("Sequence remains deterministic",i+1,photo.getInt("sequence"));
            assertTrue("Each capture has unique identity",captureIds.add(photo.getString("captureId")));
            assertTrue("Byte limit",photo.getInt("bytes")<=120000);
        }
    }

    public void testTouchDownFreezesLabelBeforeReleaseAndSaving() throws Exception {
        CameraQaActivity activity=getActivity();CameraScreen screen=(CameraScreen)field(activity,"camera");
        View shutter=(View)field(screen,"shutter");
        for(int attempt=0;attempt<200 && !shutter.isEnabled();attempt++) Thread.sleep(100);
        assertTrue("Preview streaming",(Boolean)field(screen,"previewReady"));
        androidx.camera.core.ImageAnalysis analysis=(androidx.camera.core.ImageAnalysis)field(screen,"analysis");
        getInstrumentation().runOnMainSync(analysis::clearAnalyzer);
        ((java.util.concurrent.ExecutorService)field(screen,"analysisExecutor")).submit(() -> {}).get();
        ShutterFrameBuffer frames=(ShutterFrameBuffer)field(screen,"frames");
        SessionStore store=(SessionStore)field(activity,"store");store.reset();
        getInstrumentation().runOnMainSync(() -> {
            publishLabel(frames,60,10001);
            long now=SystemClock.uptimeMillis();
            android.view.MotionEvent down=android.view.MotionEvent.obtain(now,now,android.view.MotionEvent.ACTION_DOWN,20,20,0);
            shutter.dispatchTouchEvent(down);down.recycle();
            publishLabel(frames,210,10002); // Label moved immediately while the finger is still down.
            android.view.MotionEvent up=android.view.MotionEvent.obtain(now,now+10,android.view.MotionEvent.ACTION_UP,20,20,0);
            shutter.dispatchTouchEvent(up);up.recycle();
        });
        for(int attempt=0;attempt<200 && store.count()==0;attempt++)Thread.sleep(50);
        assertEquals("Down/up creates exactly one photo",1,store.count());
        JSONObject photo=store.snapshot().getJSONArray("photos").getJSONObject(0);
        android.graphics.Bitmap image=android.graphics.BitmapFactory.decodeFile(store.photoFile(photo.getString("key")).getPath());
        int shade=android.graphics.Color.red(image.getPixel(image.getWidth()/2,image.getHeight()/2));image.recycle();
        assertTrue("Saved pixels belong to first label, not the moved label: "+shade,shade<100);
    }

    private static void publishLabel(ShutterFrameBuffer frames,int shade,long id) {
        byte[] y=new byte[640*360],uv=new byte[640*360/4];
        java.util.Arrays.fill(y,(byte)shade);java.util.Arrays.fill(uv,(byte)128);
        frames.publish(java.nio.ByteBuffer.wrap(y),640,1,java.nio.ByteBuffer.wrap(uv),320,1,
            java.nio.ByteBuffer.wrap(uv),320,1,0,0,640,360,0,false,id,SystemClock.elapsedRealtimeNanos());
    }

    private static Object field(Object target,String name) throws Exception { Field field=target.getClass().getDeclaredField(name); field.setAccessible(true); return field.get(target); }
}
