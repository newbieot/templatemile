package com.posnew.milecamera;

import android.test.InstrumentationTestCase;
import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import org.json.JSONObject;

public final class PhotoSafetyTest extends InstrumentationTestCase {
    private File directory; private Context context;
    @Override protected void setUp() throws Exception {
        super.setUp(); directory=Files.createTempDirectory(getInstrumentation().getTargetContext().getCacheDir().toPath(),"focus-test").toFile();
        context=new ContextWrapper(getInstrumentation().getTargetContext()) { @Override public File getFilesDir() { return directory; } };
    }
    private byte[] jpeg(boolean sharp) throws Exception {
        Bitmap image=Bitmap.createBitmap(720,1280,Bitmap.Config.ARGB_8888); Canvas canvas=new Canvas(image); canvas.drawColor(Color.WHITE);
        if(sharp) { Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG); paint.setColor(Color.BLACK); paint.setTextSize(26);
            for(int y=180;y<1040;y+=42) canvas.drawText("PERUM TIBAN RIAU BERTUAH  BATAM",65,y,paint); }
        ByteArrayOutputStream bytes=new ByteArrayOutputStream(); image.compress(Bitmap.CompressFormat.JPEG,90,bytes); image.recycle(); return bytes.toByteArray();
    }
    public void testBlurPersistsBlocksTransferAndRetakeReplacesItsOriginalSlot() throws Exception {
        SessionStore store=new SessionStore(context); byte[] sharp=jpeg(true),blur=jpeg(false);
        PhotoQuality.Assessment ok=new PhotoQuality.Assessment(true,.5,8), bad=new PhotoQuality.Assessment(false,.1,0);
        store.addCaptured(sharp,0,false,"first",null,ok,null);
        store.addCaptured(blur,0,false,"blurred",null,bad,null);
        store.addCaptured(sharp,0,false,"third",null,ok,null);
        assertEquals(1,store.firstRetakeRequired()); assertEquals(1,store.retakeCount());
        assertEquals(1,new SessionStore(context).firstRetakeRequired());
        try { store.markTransferred(); fail("Blur must block transfer"); } catch(Exception expected) { assertTrue(expected.getMessage().contains("ambil ulang")); }
        JSONObject old=store.snapshot().getJSONArray("photos").getJSONObject(1); String key=old.getString("key");
        store.addCaptured(blur,0,false,"retake-blur",null,bad,key);
        assertEquals(3,store.count()); assertEquals(1,store.firstRetakeRequired()); assertTrue(store.photoFile(key).isFile());
        store.addCaptured(sharp,0,false,"retake-sharp",null,ok,key);
        assertEquals(3,store.count()); assertEquals(-1,store.firstRetakeRequired());
        assertEquals("first",store.snapshot().getJSONArray("photos").getJSONObject(0).getString("captureId"));
        JSONObject fixed=store.snapshot().getJSONArray("photos").getJSONObject(1);
        assertEquals(2,fixed.getInt("sequence")); assertEquals("retake-sharp",fixed.getString("captureId"));
        assertEquals("third",store.snapshot().getJSONArray("photos").getJSONObject(2).getString("captureId"));
        assertFalse(store.photoFile(key).exists()); store.markTransferred(); assertTrue(store.transferred());
    }
    public void testOldDraftPhotosAreMeasuredBeforeTransfer() throws Exception {
        SessionStore store=new SessionStore(context); store.addCaptured(jpeg(true),0,false,"legacy-sharp",null);
        store.addCaptured(jpeg(false),0,false,"legacy-blur",null);
        assertEquals(1,store.inspectDraftQuality());
        assertFalse(store.snapshot().getJSONArray("photos").getJSONObject(0).getBoolean("requiresRetake"));
        assertTrue(store.snapshot().getJSONArray("photos").getJSONObject(1).getBoolean("requiresRetake"));
        assertEquals(1,new SessionStore(context).inspectDraftQuality());
    }
    public void testFutureReleaseMetadataOnlyPromptsForNewerOfficialApp() throws Exception {
        JSONObject release=new JSONObject().put("applicationId","com.posnew.milecamera").put("versionCode",9)
            .put("versionName","0.1.8").put("downloadUrl","https://mile.posnew.com/downloads/Mile-Camera-0.1.8.apk");
        assertNotNull(AppUpdates.parse(release,8)); assertNull(AppUpdates.parse(release,9));
        release.put("applicationId","other.app"); assertNull(AppUpdates.parse(release,8));
        release.put("applicationId","com.posnew.milecamera").put("downloadUrl","https://evil.test/download.apk"); assertNull(AppUpdates.parse(release,8));
    }
    public void testReadableConfirmationPersistsForOnlyItsPhotoAndSurvivesReassessment() throws Exception {
        SessionStore store=new SessionStore(context); PhotoQuality.Assessment bad=new PhotoQuality.Assessment(false,0,0);
        store.addCaptured(jpeg(false),0,false,"uncertain-first",null,bad,null);
        store.addCaptured(jpeg(false),0,false,"uncertain-second",null,bad,null);
        String key=store.snapshot().getJSONArray("photos").getJSONObject(0).getString("key");
        byte[] original=Files.readAllBytes(store.photoFile(key).toPath());
        store.confirmReadable(key); assertEquals(1,store.firstRetakeRequired());
        assertTrue(java.util.Arrays.equals(original,Files.readAllBytes(store.photoFile(key).toPath())));
        SessionStore restored=new SessionStore(context); assertEquals(1,restored.inspectDraftQuality());
        assertTrue(restored.snapshot().getJSONArray("photos").getJSONObject(0).getBoolean("userConfirmedReadable"));
        String second=restored.snapshot().getJSONArray("photos").getJSONObject(1).getString("key");
        restored.confirmReadable(second); assertEquals(-1,new SessionStore(context).inspectDraftQuality());
        restored.markTransferred();
        try { restored.confirmReadable(java.util.UUID.randomUUID().toString()); fail("Cannot approve another photo"); } catch(Exception expected) { }
    }
    public void testOldDarkFalsePositiveIsReassessedWithNewDetector() throws Exception {
        Bitmap image=Bitmap.createBitmap(720,1280,Bitmap.Config.ARGB_8888); Canvas canvas=new Canvas(image); canvas.drawColor(Color.rgb(32,32,32));
        Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG); paint.setColor(Color.rgb(10,10,10)); paint.setTextSize(26);
        for(int y=180;y<1040;y+=42) canvas.drawText("PERUM TIBAN RIAU BERTUAH BATAM",65,y,paint);
        ByteArrayOutputStream bytes=new ByteArrayOutputStream(); image.compress(Bitmap.CompressFormat.JPEG,90,bytes); image.recycle();
        SessionStore store=new SessionStore(context); store.addCaptured(bytes.toByteArray(),0,false,"dark-legacy",null);
        JSONObject manifest=store.snapshot(); manifest.getJSONArray("photos").getJSONObject(0).put("qualityVersion","focus-1").put("requiresRetake",true);
        String key=manifest.getJSONArray("photos").getJSONObject(0).getString("key");
        Files.write(new File(store.photoFile(key).getParentFile(),"session.json").toPath(),manifest.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        SessionStore restored=new SessionStore(context); assertEquals(0,restored.firstRetakeRequired());
        assertEquals(-1,restored.inspectDraftQuality());
    }
}
