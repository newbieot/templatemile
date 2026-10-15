package com.posnew.milecamera;

import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.test.InstrumentationTestCase;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public final class BatchHistoryTest extends InstrumentationTestCase {
    private File directory; private Context context;
    @Override protected void setUp() throws Exception {
        super.setUp(); directory=Files.createTempDirectory(getInstrumentation().getTargetContext().getCacheDir().toPath(),"batch-history-test").toFile();
        context=new ContextWrapper(getInstrumentation().getTargetContext()) { @Override public File getFilesDir() { return directory; } };
    }
    static byte[] jpeg(int color,int width,int height) {
        Bitmap image=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888); image.eraseColor(color);
        ByteArrayOutputStream bytes=new ByteArrayOutputStream(); image.compress(Bitmap.CompressFormat.JPEG,90,bytes); image.recycle(); return bytes.toByteArray();
    }
    private SessionStore draft() throws Exception {
        SessionStore store=new SessionStore(context);
        store.addCaptured(jpeg(Color.RED,720,1280),0,false,"portrait",null,new PhotoQuality.Assessment(true,.5,8),null);
        store.addCaptured(jpeg(Color.BLUE,1280,720),0,false,"landscape",null,new PhotoQuality.Assessment(true,.5,8),null);
        return store;
    }
    public void testSaveSurvivesNewBatchAndRestartWithOriginalImagesAndValidOrderedPdf() throws Exception {
        SessionStore active=draft(); String id=active.id(); BatchHistory history=new BatchHistory(context);
        JSONObject original=active.snapshot(); File pdf=history.save(active); byte[] firstPdf=Files.readAllBytes(pdf.toPath());
        assertTrue(BatchHistory.downloadName(original).matches("Mile-Camera-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\\.pdf"));
        assertPdf(pdf,2,true); history.startNewBatch(active);
        assertEquals(0,active.count()); assertFalse(id.equals(active.id()));
        BatchHistory restored=new BatchHistory(context); assertEquals(1,restored.list().size());
        JSONObject saved=restored.list().get(0); assertEquals(id,saved.getString("id")); assertEquals(original.getString("startedAt"),saved.getString("startedAt"));
        SessionStore old=restored.open(id); assertEquals(2,old.count());
        assertEquals("portrait",old.snapshot().getJSONArray("photos").getJSONObject(0).getString("captureId"));
        assertTrue(Arrays.equals(firstPdf,Files.readAllBytes(restored.pdf(id).toPath())));
        old.markTransferred(); restored.save(old); assertTrue(restored.list().get(0).getBoolean("transferred"));
        active.addCaptured(jpeg(Color.GREEN,720,1280),0,false,"second-batch",null); restored.save(active);
        assertEquals(2,new BatchHistory(context).list().size()); assertEquals(2,restored.open(id).count());
    }
    public void testRetakeRebuildsOnlyItsPdfAndKeepsOtherDraftIntact() throws Exception {
        SessionStore active=new SessionStore(context); BatchHistory history=new BatchHistory(context);
        active.addCaptured(jpeg(Color.RED,720,1280),0,false,"blur",null,new PhotoQuality.Assessment(false,0,0),null);
        String id=active.id(); File oldPdf=history.save(active); history.startNewBatch(active);
        active.addCaptured(jpeg(Color.GREEN,720,1280),0,false,"unrelated-active",null);
        SessionStore old=history.open(id); String key=old.snapshot().getJSONArray("photos").getJSONObject(0).getString("key");
        old.addCaptured(jpeg(Color.BLUE,720,1280),0,false,"retake",null,new PhotoQuality.Assessment(true,.5,8),key);
        File newPdf=history.save(old); assertFalse(oldPdf.equals(newPdf)); assertEquals(-1,history.open(id).firstRetakeRequired());
        assertEquals("unrelated-active",active.snapshot().getJSONArray("photos").getJSONObject(0).getString("captureId"));
        assertPdf(newPdf,1,false);
    }
    public void testMissingPhotoCannotSilentlyResetOrPublishPartialBatch() throws Exception {
        SessionStore active=draft(); String id=active.id(); String key=active.snapshot().getJSONArray("photos").getJSONObject(1).getString("key");
        assertTrue(active.photoFile(key).delete()); BatchHistory history=new BatchHistory(context);
        try { history.startNewBatch(active); fail("Incomplete archive must not clear the current batch"); } catch(Exception expected) { }
        assertEquals(id,active.id()); assertEquals(2,active.count()); assertEquals(0,history.list().size());
        try { history.open("../capture-draft"); fail("Traversal must be rejected"); } catch(IllegalArgumentException expected) { }
    }
    public void testInterruptedPdfRegeneratesAndDoesNotReuseTruncatedBytes() throws Exception {
        SessionStore active=draft(); BatchHistory history=new BatchHistory(context); File pdf=history.save(active);
        try(FileOutputStream output=new FileOutputStream(pdf)) { output.write("%PDF-1.4\ninterrupted".getBytes(java.nio.charset.StandardCharsets.US_ASCII)); }
        assertPdf(history.pdf(active.id()),2,true);
    }
    public void testMaximumBatchStreams150PagesWithoutFullBitmapCopies() throws Exception {
        File jpeg=new File(directory,"stream.jpg"); Files.write(jpeg.toPath(),jpeg(Color.RED,720,1280));
        List<PhotoBatchPdf.Page> pages=new ArrayList<>(); for(int i=0;i<150;i++) pages.add(new PhotoBatchPdf.Page(jpeg,720,1280));
        File pdf=new File(directory,"max.pdf"); try(FileOutputStream output=new FileOutputStream(pdf)) { PhotoBatchPdf.write(output,pages); }
        try(ParcelFileDescriptor descriptor=ParcelFileDescriptor.open(pdf,ParcelFileDescriptor.MODE_READ_ONLY); PdfRenderer renderer=new PdfRenderer(descriptor)) { assertEquals(150,renderer.getPageCount()); }
        assertTrue("JPEG bytes are embedded without rasterizing every page in memory",pdf.length()<jpeg.length()*150+200000);
    }
    public void testDownloadOnModernAndroidRequiresNoStoragePermissionAndMatchesPrivatePdf() throws Exception {
        if(Build.VERSION.SDK_INT<29) return;
        SessionStore active=draft(); BatchHistory history=new BatchHistory(context); File pdf=history.save(active);
        Context target=getInstrumentation().getTargetContext(); Uri uri=PdfDownloads.save(target,pdf,BatchHistory.downloadName(active.snapshot()));
        try {
            assertEquals("content",uri.getScheme());
            try(android.database.Cursor cursor=target.getContentResolver().query(uri,new String[]{"_display_name","relative_path","is_pending","mime_type"},null,null,null)) {
                assertNotNull(cursor); assertTrue(cursor.moveToFirst()); assertEquals(BatchHistory.downloadName(active.snapshot()),cursor.getString(0));
                assertEquals("Download/MileCamera/",cursor.getString(1)); assertEquals(0,cursor.getInt(2)); assertEquals("application/pdf",cursor.getString(3));
            }
            try(java.io.InputStream input=target.getContentResolver().openInputStream(uri); ByteArrayOutputStream bytes=new ByteArrayOutputStream()) {
                byte[] buffer=new byte[8192]; int read; while((read=input.read(buffer))!=-1) bytes.write(buffer,0,read);
                assertTrue(Arrays.equals(Files.readAllBytes(pdf.toPath()),bytes.toByteArray()));
            }
        } finally { target.getContentResolver().delete(uri,null,null); }
    }
    public void testPdfViewerUsesReadOnlyContentUriFromPrivateHistory() throws Exception {
        SessionStore active=draft(); Context target=getInstrumentation().getTargetContext();
        File pdf=new BatchHistory(target).save(active); Uri uri=PdfDownloads.viewUri(target,pdf);
        assertEquals("content",uri.getScheme()); assertEquals(target.getPackageName()+".pdf-files",uri.getAuthority());
        try(ParcelFileDescriptor descriptor=target.getContentResolver().openFileDescriptor(uri,"r"); PdfRenderer renderer=new PdfRenderer(descriptor)) { assertEquals(2,renderer.getPageCount()); }
        assertFalse(target.getPackageManager().resolveContentProvider(uri.getAuthority(),0).exported);
    }
    private void assertPdf(File pdf,int count,boolean checkTwoColors) throws Exception {
        try(ParcelFileDescriptor descriptor=ParcelFileDescriptor.open(pdf,ParcelFileDescriptor.MODE_READ_ONLY); PdfRenderer renderer=new PdfRenderer(descriptor)) {
            assertEquals(count,renderer.getPageCount());
            for(int i=0;i<count;i++) try(PdfRenderer.Page page=renderer.openPage(i)) {
                if(checkTwoColors) { assertEquals(i==0?595:842,page.getWidth()); assertEquals(i==0?842:595,page.getHeight()); }
                Bitmap rendered=Bitmap.createBitmap(page.getWidth(),page.getHeight(),Bitmap.Config.ARGB_8888); rendered.eraseColor(Color.WHITE);
                page.render(rendered,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                int pixel=rendered.getPixel(rendered.getWidth()/2,rendered.getHeight()/2); rendered.recycle();
                if(checkTwoColors && i==0) assertTrue("Portrait photo is red",Color.red(pixel)>220 && Color.blue(pixel)<40);
                else assertTrue("Landscape or retake photo is blue",Color.blue(pixel)>220 && Color.red(pixel)<40);
            }
        }
    }
}
