package com.posnew.milecamera;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.os.Build;
import android.util.AtomicFile;
import androidx.exifinterface.media.ExifInterface;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;

/** Photos stay in app-private storage, including after handoff, until a new batch is requested. */
final class SessionStore {
    static final int MAX_PHOTOS = 150;
    static final int MAX_PHOTO_BYTES = 120_000;
    static final int PHOTO_LONG_EDGE = 1280;
    static final int PHOTO_SHORT_EDGE = 720;
    private static final String ENCODING_PROFILE = "720p-120kb-v1";
    private final File directory;
    private final AtomicFile metadata;
    private JSONObject session;

    SessionStore(Context context) throws Exception {
        directory = new File(context.getFilesDir(), "capture-draft");
        if (!directory.exists() && !directory.mkdirs()) throw new Exception("Penyimpanan foto tidak tersedia.");
        metadata = new AtomicFile(new File(directory, "session.json"));
        try { session = new JSONObject(new String(metadata.readFully(), StandardCharsets.UTF_8)); }
        catch (Exception ignored) { createEmpty(); }
        JSONArray photos = session.getJSONArray("photos");
        for (int i = photos.length() - 1; i >= 0; i--) {
            File file = photoFile(photos.getJSONObject(i).getString("key"));
            if (!file.isFile() && !new File(file.getPath() + ".bak").isFile()) { photos.remove(i); continue; }
            // Restore AtomicFile's last complete JPEG after an interrupted migration.
            try (FileInputStream ignored = new AtomicFile(file).openRead()) { /* Opening recovers the file. */ }
        }
        // Upgrade previous APK drafts before any photo can reach the WebView handoff.
        for (int i = 0; i < photos.length(); i++) migratePhoto(photos.getJSONObject(i));
        persist();
    }

    private void createEmpty() throws Exception {
        session = new JSONObject().put("id", "CAM-" + UUID.randomUUID()).put("startedAt", Instant.now().toString())
            .put("deviceName", Build.MANUFACTURER + " " + Build.MODEL).put("photos", new JSONArray()).put("transferred", false)
            .put("destinationMode", "mixed");
    }

    synchronized int count() { return session.optJSONArray("photos").length(); }
    synchronized int firstRetakeRequired() {
        JSONArray photos=session.optJSONArray("photos");
        for(int i=0;i<photos.length();i++) if(photos.optJSONObject(i).optBoolean("requiresRetake")) return i;
        return -1;
    }
    synchronized int retakeCount() {
        int total=0; JSONArray photos=session.optJSONArray("photos");
        for(int i=0;i<photos.length();i++) if(photos.optJSONObject(i).optBoolean("requiresRetake")) total++;
        return total;
    }
    // Preflight older drafts once, off the UI thread. Unknown quality must be
    // assessed before transfer; a failed decode never silently approves a photo.
    int inspectDraftQuality() throws Exception {
        JSONArray photos=snapshot().getJSONArray("photos");
        for(int i=0;i<photos.length();i++) {
            JSONObject photo=photos.getJSONObject(i);
            if(PhotoQuality.VERSION.equals(photo.optString("qualityVersion"))) continue;
            Bitmap bitmap=BitmapFactory.decodeFile(photoFile(photo.getString("key")).getPath());
            if(bitmap==null) throw new Exception("Foto "+(i+1)+" tidak dapat dibaca. Ambil ulang foto tersebut.");
            PhotoQuality.Assessment quality;
            try {
                int width=bitmap.getWidth(),height=bitmap.getHeight();
                int[] pixels=new int[width*height]; bitmap.getPixels(pixels,0,width,0,0,width,height);
                byte[] gray=new byte[pixels.length];
                for(int p=0;p<pixels.length;p++) { int color=pixels[p]; gray[p]=(byte)((77*((color>>16)&255)+150*((color>>8)&255)+29*(color&255))>>8); }
                quality=PhotoQuality.assess(gray,width,height);
            } finally { bitmap.recycle(); }
            synchronized(this) {
                JSONArray current=session.getJSONArray("photos");
                for(int p=0;p<current.length();p++) if(photo.getString("key").equals(current.getJSONObject(p).optString("key")))
                    setQuality(current.getJSONObject(p),quality);
                persist();
            }
        }
        return firstRetakeRequired();
    }
    private static void setQuality(JSONObject photo,PhotoQuality.Assessment quality) throws Exception {
        photo.put("qualityVersion",PhotoQuality.VERSION).put("requiresRetake",!quality.accepted)
            .put("sharpness",quality.sharpness).put("sharpTiles",quality.sharpTiles);
    }
    synchronized boolean transferred() { return session.optBoolean("transferred"); }
    synchronized String id() { return session.optString("id"); }
    synchronized String destinationMode() {
        String mode = session.optString("destinationMode", "batam");
        return mode.equals("mixed") || mode.equals("cn23") ? mode : "batam";
    }
    synchronized void setDestinationMode(String mode) throws Exception {
        if (!mode.equals("batam") && !mode.equals("cn23") && !mode.equals("mixed")) throw new Exception("Mode tujuan tidak valid.");
        if (count() > 0 && !mode.equals(destinationMode())) throw new Exception("Mulai batch baru untuk mengganti mode tujuan.");
        session.put("destinationMode", mode);
        persist();
    }
    synchronized JSONObject snapshot() throws Exception { return new JSONObject(session.toString()); }
    synchronized File photoFile(String key) {
        if (!key.matches("[a-f0-9-]{36}")) throw new IllegalArgumentException("Foto tidak valid.");
        return new File(directory, key + ".jpg");
    }
    synchronized File thumbnailFile(String key) {
        photoFile(key);
        return new File(directory, key + "-thumb.jpg");
    }
    synchronized File findPhoto(String key) {
        JSONArray photos = session.optJSONArray("photos");
        for (int i = 0; i < photos.length(); i++) {
            if (key.equals(photos.optJSONObject(i).optString("key"))) return photoFile(key);
        }
        return null;
    }

    /**
     * Compatibility path for old callers/tests. Expensive bitmap work intentionally happens outside
     * the synchronized commit so the UI can keep reading the current session while JPEG work runs.
     */
    void add(File original) throws Exception {
        EncodedPhoto encoded = encodePhoto(original);
        commitEncoded(encoded, null, Instant.now().toString());
    }

    /**
     * Fast CameraX path. The ImageProxy is copied and closed by CameraScreen, then all decode,
     * rotation, compression, thumbnail generation and file writes happen on the photo worker.
     */
    void addCaptured(byte[] originalJpeg, int rotationDegrees, boolean flipHorizontal, String captureId, String capturedAt) throws Exception {
        addCaptured(originalJpeg,rotationDegrees,flipHorizontal,captureId,capturedAt,null,null);
    }
    void addCaptured(byte[] originalJpeg,int rotationDegrees,boolean flipHorizontal,String captureId,String capturedAt,
                     PhotoQuality.Assessment quality,String replacementKey) throws Exception {
        // A failed retake keeps the original slot and remains blocked. The
        // operator can immediately retry without appending another bad photo.
        if(replacementKey!=null && quality!=null && !quality.accepted) return;
        EncodedPhoto encoded = encodePhoto(originalJpeg, rotationDegrees, flipHorizontal);
        commitEncoded(encoded, captureId, capturedAt,quality,replacementKey);
    }

    private synchronized void commitEncoded(EncodedPhoto encoded, String captureId, String capturedAt) throws Exception {
        commitEncoded(encoded,captureId,capturedAt,null,null);
    }
    private synchronized void commitEncoded(EncodedPhoto encoded,String captureId,String capturedAt,
                                            PhotoQuality.Assessment quality,String replacementKey) throws Exception {
        JSONArray photos=session.getJSONArray("photos"); int replacement=-1; JSONObject previous=null;
        if(replacementKey!=null) {
            for(int i=0;i<photos.length();i++) if(replacementKey.equals(photos.getJSONObject(i).optString("key"))) replacement=i;
            if(replacement<0 || !photos.getJSONObject(replacement).optBoolean("requiresRetake")) throw new Exception("Foto ulang tidak lagi diperlukan. Periksa batch.");
            previous=photos.getJSONObject(replacement);
        } else if (count() >= MAX_PHOTOS) throw new Exception("Batch sudah berisi 150 foto.");
        String key = UUID.randomUUID().toString();
        boolean previousTransferred = transferred();
        try {
            writeAtomic(photoFile(key), encoded.jpeg);
            writeAtomic(thumbnailFile(key), encoded.thumbnail);
            int sequence = replacement>=0?replacement+1:count()+1;
            JSONObject photo = new JSONObject().put("key", key).put("captureId", captureId == null ? "native-" + key : captureId)
                .put("sequence", sequence).put("fileName", String.format(java.util.Locale.ROOT, "%03d.jpg", sequence))
                .put("timestamp", capturedAt == null ? Instant.now().toString() : capturedAt)
                .put("width", encoded.width).put("height", encoded.height)
                .put("bytes", encoded.jpeg.length).put("encodingProfile", ENCODING_PROFILE).put("source", "android-camerax");
            if(quality!=null) setQuality(photo,quality);
            if(previous!=null) photo.put("retakeOf",previous.optString("captureId"));
            if(replacement>=0) photos.put(replacement,photo); else photos.put(photo);
            session.put("transferred", false);
            try { persist(); } catch (Exception failure) {
                if(replacement>=0) photos.put(replacement,previous); else photos.remove(count()-1);
                session.put("transferred", previousTransferred);
                throw failure;
            }
            if(previous!=null) { photoFile(previous.getString("key")).delete(); thumbnailFile(previous.getString("key")).delete(); }
        } catch (Exception error) {
            photoFile(key).delete();
            thumbnailFile(key).delete();
            throw error;
        }
    }

    private void migratePhoto(JSONObject photo) throws Exception {
        String key = photo.getString("key");
        File original = photoFile(key);
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(original.getPath(), bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new Exception("Foto tersimpan tidak dapat dibaca. Foto asli tetap disimpan.");
        boolean withinDimensions = Math.max(bounds.outWidth, bounds.outHeight) <= PHOTO_LONG_EDGE
            && Math.min(bounds.outWidth, bounds.outHeight) <= PHOTO_SHORT_EDGE;
        if (!ENCODING_PROFILE.equals(photo.optString("encodingProfile")) || !withinDimensions || original.length() > MAX_PHOTO_BYTES) {
            EncodedPhoto encoded = encodePhoto(original);
            // AtomicFile rolls back an interrupted write instead of losing the old draft.
            writeAtomic(original, encoded.jpeg);
            writeAtomic(thumbnailFile(key), encoded.thumbnail);
            photo.put("width", encoded.width).put("height", encoded.height).put("bytes", encoded.jpeg.length)
                .put("encodingProfile", ENCODING_PROFILE);
        } else {
            photo.put("width", bounds.outWidth).put("height", bounds.outHeight).put("bytes", original.length());
        }
    }

    private static EncodedPhoto encodePhoto(byte[] originalJpeg, int rotationDegrees, boolean flipHorizontal) throws Exception {
        if (originalJpeg == null || originalJpeg.length == 0) throw new Exception("Foto kamera kosong.");
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(originalJpeg, 0, originalJpeg.length, bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new Exception("Foto kamera tidak dapat dibaca.");

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 4096) options.inSampleSize *= 2;
        Bitmap decoded = BitmapFactory.decodeByteArray(originalJpeg, 0, originalJpeg.length, options);
        if (decoded == null) throw new Exception("Memori tidak cukup untuk membaca foto.");
        Bitmap upright = decoded;
        Bitmap cropped = null;
        Bitmap image = null;
        Bitmap thumbnail = null;
        try {
            Matrix transform = new Matrix();
            if (rotationDegrees != 0) transform.postRotate(rotationDegrees);
            if (flipHorizontal) transform.postScale(-1, 1);
            if (!transform.isIdentity()) upright = Bitmap.createBitmap(decoded, 0, 0, decoded.getWidth(), decoded.getHeight(), transform, true);
            cropped = crop16By9(upright);
            image = scale(cropped, PHOTO_LONG_EDGE);
            byte[] jpeg = jpegWithinBudget(image);
            thumbnail = scale(image, 320);
            return new EncodedPhoto(jpeg, compressJpeg(thumbnail, 76), image.getWidth(), image.getHeight());
        } finally {
            if (thumbnail != null && thumbnail != image) thumbnail.recycle();
            if (image != null && image != cropped) image.recycle();
            if (cropped != null && cropped != upright) cropped.recycle();
            if (upright != decoded) upright.recycle();
            decoded.recycle();
        }
    }

    private static EncodedPhoto encodePhoto(File original) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(original.getPath(), bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new Exception("Foto kamera tidak dapat dibaca.");
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 4096) options.inSampleSize *= 2;
        Bitmap decoded = BitmapFactory.decodeFile(original.getPath(), options);
        if (decoded == null) throw new Exception("Memori tidak cukup untuk membaca foto.");
        Bitmap upright = decoded;
        Bitmap cropped = null;
        Bitmap image = null;
        Bitmap thumbnail = null;
        try {
            ExifInterface exif = new ExifInterface(original);
            Matrix transform = new Matrix();
            transform.postRotate(exif.getRotationDegrees());
            if (exif.isFlipped()) transform.postScale(-1, 1);
            if (!transform.isIdentity()) upright = Bitmap.createBitmap(decoded, 0, 0, decoded.getWidth(), decoded.getHeight(), transform, true);
            cropped = crop16By9(upright);
            image = scale(cropped, PHOTO_LONG_EDGE);
            byte[] jpeg = jpegWithinBudget(image);
            thumbnail = scale(image, 320);
            return new EncodedPhoto(jpeg, compressJpeg(thumbnail, 80), image.getWidth(), image.getHeight());
        } finally {
            if (thumbnail != null && thumbnail != image) thumbnail.recycle();
            if (image != null && image != cropped) image.recycle();
            if (cropped != null && cropped != upright) cropped.recycle();
            if (upright != decoded) upright.recycle();
            decoded.recycle();
        }
    }

    private static Bitmap crop16By9(Bitmap bitmap) {
        boolean portrait = bitmap.getHeight() > bitmap.getWidth();
        double ratio = portrait ? 9d / 16d : 16d / 9d;
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        if (width / (double) height > ratio) width = Math.max(1, (int) Math.floor(height * ratio));
        else height = Math.max(1, (int) Math.floor(width / ratio));
        if (width == bitmap.getWidth() && height == bitmap.getHeight()) return bitmap;
        return Bitmap.createBitmap(bitmap, (bitmap.getWidth() - width) / 2, (bitmap.getHeight() - height) / 2, width, height);
    }

    private static byte[] jpegWithinBudget(Bitmap image) throws Exception {
        // Document frames normally fit immediately. For dense frames, jump close to the target
        // quality from the observed byte ratio, then refine only a small bounded range.
        final int firstQuality = 82;
        byte[] first = compressJpeg(image, firstQuality);
        if (first.length <= MAX_PHOTO_BYTES) return first;

        double ratio = MAX_PHOTO_BYTES / (double) first.length;
        int estimate = Math.max(18, Math.min(78, (int) Math.floor(firstQuality * Math.pow(ratio, 0.72))));
        byte[] candidate = compressJpeg(image, estimate);
        int fittingQuality = -1;
        byte[] best = null;
        int failingQuality = firstQuality;
        if (candidate.length <= MAX_PHOTO_BYTES) { fittingQuality = estimate; best = candidate; }
        else {
            failingQuality = estimate;
            int quality = estimate - 8;
            while (quality >= 2) {
                candidate = compressJpeg(image, quality);
                if (candidate.length <= MAX_PHOTO_BYTES) { fittingQuality = quality; best = candidate; break; }
                failingQuality = quality;
                quality -= 8;
            }
        }
        if (best == null) {
            best = compressJpeg(image, 1);
            if (best.length > MAX_PHOTO_BYTES) throw new Exception("Foto belum dapat dipadatkan ke 120 KB. Coba ambil ulang.");
            fittingQuality = 1;
        }

        // At most three refinements keep CPU time bounded while recovering useful OCR quality.
        int low = fittingQuality + 1;
        int high = failingQuality - 1;
        for (int pass = 0; pass < 3 && low <= high; pass++) {
            int quality = (low + high) / 2;
            candidate = compressJpeg(image, quality);
            if (candidate.length <= MAX_PHOTO_BYTES) { best = candidate; low = quality + 1; }
            else high = quality - 1;
        }
        return best;
    }

    private static byte[] compressJpeg(Bitmap image, int quality) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(MAX_PHOTO_BYTES);
        if (!image.compress(Bitmap.CompressFormat.JPEG, quality, bytes)) throw new Exception("JPEG gagal dibuat.");
        return bytes.toByteArray();
    }

    private static void writeAtomic(File file, byte[] bytes) throws Exception {
        AtomicFile atomic = new AtomicFile(file);
        FileOutputStream output = null;
        try {
            output = atomic.startWrite();
            output.write(bytes);
            atomic.finishWrite(output);
        } catch (Exception error) { atomic.failWrite(output); throw error; }
    }

    private static final class EncodedPhoto {
        final byte[] jpeg;
        final byte[] thumbnail;
        final int width;
        final int height;
        EncodedPhoto(byte[] jpeg, byte[] thumbnail, int width, int height) {
            this.jpeg = jpeg; this.thumbnail = thumbnail; this.width = width; this.height = height;
        }
    }

    private static Bitmap scale(Bitmap bitmap, int maxSide) {
        float ratio = Math.min(1f, maxSide / (float) Math.max(bitmap.getWidth(), bitmap.getHeight()));
        return ratio == 1f ? bitmap : Bitmap.createScaledBitmap(bitmap, Math.max(1, Math.round(bitmap.getWidth() * ratio)), Math.max(1, Math.round(bitmap.getHeight() * ratio)), true);
    }

    synchronized void remove(int index) throws Exception {
        JSONArray photos = session.getJSONArray("photos");
        JSONObject photo = photos.getJSONObject(index);
        photos.remove(index);
        for (int i = 0; i < photos.length(); i++) {
            photos.getJSONObject(i).put("sequence", i + 1).put("fileName", String.format(java.util.Locale.ROOT, "%03d.jpg", i + 1));
        }
        session.put("transferred", false);
        persist();
        photoFile(photo.getString("key")).delete();
        thumbnailFile(photo.getString("key")).delete();
    }

    synchronized void markTransferred() throws Exception {
        if(firstRetakeRequired()>=0) throw new Exception("Foto buram wajib diambil ulang sebelum proses AI.");
        session.put("transferred", true); persist();
    }
    synchronized void reset() throws Exception {
        JSONArray photos = session.getJSONArray("photos");
        for (int i = 0; i < photos.length(); i++) {
            String key = photos.getJSONObject(i).getString("key");
            photoFile(key).delete();
            thumbnailFile(key).delete();
        }
        createEmpty();
        persist();
    }
    private void persist() throws Exception {
        FileOutputStream output = null;
        try {
            output = metadata.startWrite();
            output.write(session.toString().getBytes(StandardCharsets.UTF_8));
            metadata.finishWrite(output);
        } catch (Exception error) { metadata.failWrite(output); throw error; }
    }
}
