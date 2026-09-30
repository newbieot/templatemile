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
            .put("deviceName", Build.MANUFACTURER + " " + Build.MODEL).put("photos", new JSONArray()).put("transferred", false);
    }

    synchronized int count() { return session.optJSONArray("photos").length(); }
    synchronized boolean transferred() { return session.optBoolean("transferred"); }
    synchronized String id() { return session.optString("id"); }
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

    synchronized void add(File original) throws Exception {
        if (count() >= MAX_PHOTOS) throw new Exception("Batch sudah berisi 150 foto.");
        String key = UUID.randomUUID().toString();
        boolean previousTransferred = transferred();
        try {
            EncodedPhoto encoded = encodePhoto(original);
            writeAtomic(photoFile(key), encoded.jpeg);
            writeAtomic(thumbnailFile(key), encoded.thumbnail);
            JSONObject photo = new JSONObject().put("key", key).put("captureId", "native-" + key)
                .put("sequence", count() + 1).put("fileName", String.format(java.util.Locale.ROOT, "%03d.jpg", count() + 1))
                .put("timestamp", Instant.now().toString()).put("width", encoded.width).put("height", encoded.height)
                .put("bytes", encoded.jpeg.length).put("encodingProfile", ENCODING_PROFILE).put("source", "android-camerax");
            session.getJSONArray("photos").put(photo);
            session.put("transferred", false);
            try { persist(); } catch (Exception failure) {
                session.getJSONArray("photos").remove(count() - 1);
                session.put("transferred", previousTransferred);
                throw failure;
            }
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
        // Most document frames fit on the first pass; only dense frames need a quality search.
        byte[] highQuality = compressJpeg(image, 88);
        if (highQuality.length <= MAX_PHOTO_BYTES) return highQuality;
        byte[] best = compressJpeg(image, 1);
        if (best.length > MAX_PHOTO_BYTES) throw new Exception("Foto belum dapat dipadatkan ke 120 KB. Coba ambil ulang.");
        int low = 2;
        int high = 87;
        while (low <= high) {
            int quality = (low + high) / 2;
            byte[] candidate = compressJpeg(image, quality);
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

    synchronized void markTransferred() throws Exception { session.put("transferred", true); persist(); }
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
