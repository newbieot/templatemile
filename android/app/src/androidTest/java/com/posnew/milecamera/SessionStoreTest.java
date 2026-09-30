package com.posnew.milecamera;

import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.test.InstrumentationTestCase;
import android.util.AtomicFile;
import androidx.exifinterface.media.ExifInterface;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Random;
import java.util.UUID;

/** Android JPEG/EXIF tests use generated pictures and isolated app-private test directories. */
@SuppressWarnings("deprecation")
public final class SessionStoreTest extends InstrumentationTestCase {
    private File testDirectory;
    private Context context;

    @Override protected void setUp() throws Exception {
        super.setUp();
        Context target = getInstrumentation().getTargetContext();
        testDirectory = new File(target.getCacheDir(), "session-store-test-" + UUID.randomUUID());
        assertTrue(testDirectory.mkdirs());
        context = new ContextWrapper(target) {
            @Override public File getFilesDir() { return testDirectory; }
        };
    }

    @Override protected void tearDown() throws Exception {
        deleteTestFiles(testDirectory);
        super.tearDown();
    }

    public void testNoisyLandscapePhotoKeeps720pAndStrictByteLimit() throws Exception {
        File original = noisyPhoto("landscape-source.jpg", 1632, 1224);
        assertTrue("Fixture must exceed the requested byte budget", original.length() > 120_000);
        SessionStore store = new SessionStore(context);
        store.add(original);
        assertSavedPhoto(store, 1280, 720);
        assertTrue("Source file is not removed by compression", original.isFile());
    }

    public void testExifRotatedPortraitIsUprightAt720p() throws Exception {
        Bitmap bitmap = Bitmap.createBitmap(1600, 1200, Bitmap.Config.ARGB_8888);
        int[] row = new int[1600];
        Arrays.fill(row, 0, 800, Color.RED);
        Arrays.fill(row, 800, 1600, Color.BLUE);
        for (int y = 0; y < 1200; y++) bitmap.setPixels(row, 0, 1600, 0, y, 1600, 1);
        File original = writePhoto("rotated-source.jpg", bitmap);
        bitmap.recycle();
        ExifInterface exif = new ExifInterface(original);
        exif.setAttribute(ExifInterface.TAG_ORIENTATION, String.valueOf(ExifInterface.ORIENTATION_ROTATE_90));
        exif.saveAttributes();
        SessionStore store = new SessionStore(context);
        store.add(original);
        File stored = assertSavedPhoto(store, 720, 1280);
        Bitmap upright = BitmapFactory.decodeFile(stored.getPath());
        try {
            int upper = upright.getPixel(360, 160);
            int lower = upright.getPixel(360, 1120);
            assertTrue("EXIF red half rotates to the top", Color.red(upper) > 200 && Color.blue(upper) < 50);
            assertTrue("EXIF blue half rotates to the bottom", Color.blue(lower) > 200 && Color.red(lower) < 50);
        } finally { upright.recycle(); }
        assertEquals("Normalized JPEG must not rotate twice", 0, new ExifInterface(stored).getRotationDegrees());
    }

    public void testExifMirroredPhotoKeepsCorrectLeftAndRight() throws Exception {
        Bitmap bitmap = Bitmap.createBitmap(1600, 1200, Bitmap.Config.ARGB_8888);
        int[] row = new int[1600];
        Arrays.fill(row, 0, 800, Color.RED);
        Arrays.fill(row, 800, 1600, Color.BLUE);
        for (int y = 0; y < 1200; y++) bitmap.setPixels(row, 0, 1600, 0, y, 1600, 1);
        File original = writePhoto("mirrored-source.jpg", bitmap);
        bitmap.recycle();
        ExifInterface exif = new ExifInterface(original);
        exif.setAttribute(ExifInterface.TAG_ORIENTATION, String.valueOf(ExifInterface.ORIENTATION_FLIP_HORIZONTAL));
        exif.saveAttributes();
        SessionStore store = new SessionStore(context);
        store.add(original);
        File stored = assertSavedPhoto(store, 1280, 720);
        Bitmap normalized = BitmapFactory.decodeFile(stored.getPath());
        try {
            int left = normalized.getPixel(160, 360);
            int right = normalized.getPixel(1120, 360);
            assertTrue("Mirrored EXIF places blue on the left", Color.blue(left) > 200 && Color.red(left) < 50);
            assertTrue("Mirrored EXIF places red on the right", Color.red(right) > 200 && Color.blue(right) < 50);
        } finally { normalized.recycle(); }
        assertFalse("Normalized JPEG must not flip twice", new ExifInterface(stored).isFlipped());
    }

    public void testLegacyDraftMigratesAndSurvivesRestartWithoutReencoding() throws Exception {
        File large = noisyPhoto("legacy-source.jpg", 1500, 2000);
        String key = UUID.randomUUID().toString();
        File stored = seedLegacyDraft(key, Files.readAllBytes(large.toPath()), 1500, 2000);
        SessionStore migrated = new SessionStore(context);
        assertSavedPhoto(migrated, 720, 1280);
        assertEquals("CAM-existing-draft", migrated.id());
        assertTrue("Transfer state survives migration", migrated.transferred());
        JSONObject photo = migrated.snapshot().getJSONArray("photos").getJSONObject(0);
        assertEquals("Preserve capture identity", "native-legacy", photo.getString("captureId"));
        assertEquals("Preserve capture time", "2026-09-29T12:00:00Z", photo.getString("timestamp"));
        byte[] once = Files.readAllBytes(stored.toPath());
        SessionStore restarted = new SessionStore(context);
        assertSavedPhoto(restarted, 720, 1280);
        assertTrue("Already upgraded photos are not recompressed on every launch", Arrays.equals(once, Files.readAllBytes(stored.toPath())));
    }

    public void testInterruptedLegacyWriteRecoversOriginalDraft() throws Exception {
        File large = noisyPhoto("interrupted-source.jpg", 1280, 960);
        String key = UUID.randomUUID().toString();
        File stored = seedLegacyDraft(key, Files.readAllBytes(large.toPath()), 1280, 960);
        // Simulate older Android AtomicFile's backup during a stopped write.
        assertTrue(stored.renameTo(new File(stored.getPath() + ".bak")));
        SessionStore recovered = new SessionStore(context);
        assertEquals("Interrupted migration must keep the photo in its batch", 1, recovered.count());
        assertSavedPhoto(recovered, 1280, 720);
        assertFalse(new File(stored.getPath() + ".bak").exists());
    }

    public void testUnconvertibleLegacyPhotoDoesNotOverwriteSource() throws Exception {
        String key = UUID.randomUUID().toString();
        byte[] original = "invalid-jpeg-still-kept".getBytes(StandardCharsets.UTF_8);
        File stored = seedLegacyDraft(key, original, 2048, 1536);
        try {
            new SessionStore(context);
            fail("A corrupt draft must block handoff instead of violating the budget");
        } catch (Exception expected) {
            assertTrue("An unreadable original must remain untouched", Arrays.equals(original, Files.readAllBytes(stored.toPath())));
        }
    }

    private File assertSavedPhoto(SessionStore store, int width, int height) throws Exception {
        assertEquals(1, store.count());
        JSONObject photo = store.snapshot().getJSONArray("photos").getJSONObject(0);
        File file = store.findPhoto(photo.getString("key"));
        assertNotNull(file);
        assertTrue("JPEG must never exceed decimal 120 KB", file.length() > 0 && file.length() <= 120_000);
        assertEquals("Metadata byte size matches actual file", file.length(), photo.getLong("bytes"));
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getPath(), bounds);
        assertEquals(width, bounds.outWidth);
        assertEquals(height, bounds.outHeight);
        assertEquals(width, photo.getInt("width"));
        assertEquals(height, photo.getInt("height"));
        assertEquals("image/jpeg", bounds.outMimeType);
        assertTrue("Thumbnail is available for native gallery", store.thumbnailFile(photo.getString("key")).isFile());
        return file;
    }

    private File noisyPhoto(String name, int width, int height) throws Exception {
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Random random = new Random(413L);
        int[] row = new int[width];
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) row[x] = 0xff000000 | random.nextInt(0x1000000);
            bitmap.setPixels(row, 0, width, 0, y, width, 1);
        }
        try { return writePhoto(name, bitmap); } finally { bitmap.recycle(); }
    }

    private File writePhoto(String name, Bitmap bitmap) throws Exception {
        File file = new File(testDirectory, name);
        try (FileOutputStream output = new FileOutputStream(file)) {
            assertTrue(bitmap.compress(Bitmap.CompressFormat.JPEG, 95, output));
        }
        return file;
    }

    private File seedLegacyDraft(String key, byte[] jpeg, int width, int height) throws Exception {
        File draft = new File(testDirectory, "capture-draft");
        assertTrue(draft.mkdirs());
        File file = new File(draft, key + ".jpg");
        Files.write(file.toPath(), jpeg);
        JSONObject photo = new JSONObject().put("key", key).put("captureId", "native-legacy")
            .put("sequence", 1).put("fileName", "001.jpg").put("timestamp", "2026-09-29T12:00:00Z")
            .put("width", width).put("height", height).put("bytes", jpeg.length).put("source", "android-camerax");
        JSONObject session = new JSONObject().put("id", "CAM-existing-draft").put("startedAt", "2026-09-29T11:59:00Z")
            .put("deviceName", "Generated Android test fixture").put("transferred", true).put("photos", new JSONArray().put(photo));
        AtomicFile metadata = new AtomicFile(new File(draft, "session.json"));
        FileOutputStream output = metadata.startWrite();
        output.write(session.toString().getBytes(StandardCharsets.UTF_8));
        metadata.finishWrite(output);
        return file;
    }

    private void deleteTestFiles(File file) throws Exception {
        if (file == null || !file.exists()) return;
        String rootPath = testDirectory.getCanonicalPath();
        String filePath = file.getCanonicalPath();
        assertTrue("Cleanup stays inside generated fixture directory", filePath.equals(rootPath) || filePath.startsWith(rootPath + File.separator));
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteTestFiles(child);
        assertTrue("Remove generated test file", file.delete());
    }
}
