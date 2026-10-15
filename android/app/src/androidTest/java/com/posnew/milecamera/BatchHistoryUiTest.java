package com.posnew.milecamera;

import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.Color;
import android.test.ActivityInstrumentationTestCase2;
import android.view.accessibility.AccessibilityNodeInfo;
import java.io.File;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Files;

public final class BatchHistoryUiTest extends ActivityInstrumentationTestCase2<MainActivity> {
    public BatchHistoryUiTest() { super(MainActivity.class); }
    @Override protected void setUp() throws Exception { super.setUp(); new AndroidSession(getInstrumentation().getTargetContext()).clear(); }
    @Override protected void tearDown() throws Exception { new AndroidSession(getInstrumentation().getTargetContext()).clear(); super.tearDown(); }
    public void testFinishAutomaticallySavesPdfThenHistoryAiOpensCorrectBatchWithoutLosingNewDraft() throws Exception {
        MainActivity activity=getActivity();
        for(int i=0;i<150 && field(activity,"activeStore")==null;i++) Thread.sleep(50);
        assertNotNull(field(activity,"activeStore"));
        File root=Files.createTempDirectory(activity.getCacheDir().toPath(),"history-ui-test").toFile();
        Context isolated=new ContextWrapper(activity) { @Override public File getFilesDir() { return root; } };
        SessionStore active=new SessionStore(isolated); BatchHistory history=new BatchHistory(isolated);
        active.addCaptured(BatchHistoryTest.jpeg(Color.RED,720,1280),0,false,"blurred-original",null,new PhotoQuality.Assessment(false,0,0),null);
        String completedId=active.id();
        AndroidSession login=(AndroidSession)field(activity,"session");
        login.storeVerified("__Host-mile_session=android1."+new String(new char[64]).replace('\0','a'),"fixture@test.invalid");
        getInstrumentation().runOnMainSync(()->{
            try { set(activity,"activeStore",active); set(activity,"store",active); set(activity,"history",history); invoke(activity,"finishBatch"); }
            catch(Exception error) { throw new RuntimeException(error); }
        });
        waitForText("PDF tersimpan otomatis");
        assertEquals(1,history.list().size()); assertTrue(history.pdf(completedId).isFile()); assertEquals(0,active.count());
        assertFalse(completedId.equals(active.id()));
        active.addCaptured(BatchHistoryTest.jpeg(Color.GREEN,720,1280),0,false,"new-draft",null);
        AccessibilityNodeInfo action=null;
        for(AccessibilityNodeInfo node:getInstrumentation().getUiAutomation().getRootInActiveWindow().findAccessibilityNodeInfosByText("Proses AI"))
            if(node.isClickable() && node.isEnabled()) { action=node; break; }
        assertNotNull("The dialog offers a clickable AI action",action);
        assertTrue(action.performAction(AccessibilityNodeInfo.ACTION_CLICK));
        for(int i=0;i<150 && !"gallery".equals(field(activity,"screen"));i++) Thread.sleep(50);
        assertEquals("gallery",field(activity,"screen"));
        assertEquals(completedId,((SessionStore)field(activity,"store")).id());
        assertEquals(1,active.count()); assertEquals("new-draft",active.snapshot().getJSONArray("photos").getJSONObject(0).getString("captureId"));
        getInstrumentation().runOnMainSync(()->{ try { invoke(activity,"showHistory"); } catch(Exception error) { throw new RuntimeException(error); } });
        waitForText("Lihat gambar");
        assertEquals(1,history.list().size()); assertTrue(history.pdf(completedId).isFile());
    }
    private void waitForText(String text) throws Exception {
        for(int i=0;i<150;i++) {
            AccessibilityNodeInfo root=getInstrumentation().getUiAutomation().getRootInActiveWindow();
            if(root!=null && !root.findAccessibilityNodeInfosByText(text).isEmpty()) return;
            Thread.sleep(100);
        }
        fail("Missing UI text: "+text);
    }
    private static Object field(Object target,String name) throws Exception { Field field=target.getClass().getDeclaredField(name); field.setAccessible(true); return field.get(target); }
    private static void set(Object target,String name,Object value) throws Exception { Field field=target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target,value); }
    private static void invoke(Object target,String name) throws Exception { Method method=target.getClass().getDeclaredMethod(name); method.setAccessible(true); method.invoke(target); }
}
