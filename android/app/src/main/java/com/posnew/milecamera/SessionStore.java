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
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Instant;
import java.util.UUID;

/** Photos stay in app-private storage, including after handoff, until a new batch is requested. */
final class SessionStore {
    static final int MAX_PHOTOS = 150;
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
            if (!photoFile(photos.getJSONObject(i).getString("key")).isFile()) photos.remove(i);
        }
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
        Bitmap image = null;
        Bitmap thumbnail = null;
        String key = UUID.randomUUID().toString();
        try {
            ExifInterface exif = new ExifInterface(original);
            Matrix transform = new Matrix();
            transform.postRotate(exif.getRotationDegrees());
            if (exif.isFlipped()) transform.postScale(-1, 1);
            if (!transform.isIdentity()) upright = Bitmap.createBitmap(decoded, 0, 0, decoded.getWidth(), decoded.getHeight(), transform, true);
            image = scale(upright, 2048);
            byte[] jpeg = null;
            for (int sizeAttempt = 0; sizeAttempt < 4; sizeAttempt++) {
                for (int quality : new int[] {92, 84, 76, 68}) {
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    if (!image.compress(Bitmap.CompressFormat.JPEG, quality, bytes)) throw new Exception("JPEG gagal dibuat.");
                    jpeg = bytes.toByteArray();
                    if (jpeg.length <= 1500 * 1024) break;
                }
                if (jpeg.length <= 1500 * 1024) break;
                Bitmap smaller = scale(image, Math.max(1024, (int) (Math.max(image.getWidth(), image.getHeight()) * .8)));
                if (image != upright && image != smaller) image.recycle();
                image = smaller;
            }
            if (jpeg.length > 1500 * 1024) throw new Exception("Foto terlalu besar. Ambil ulang lebih dekat.");
            Files.write(photoFile(key).toPath(), jpeg);
            thumbnail = scale(image, 320);
            try (FileOutputStream output = new FileOutputStream(thumbnailFile(key))) { thumbnail.compress(Bitmap.CompressFormat.JPEG, 80, output); }
            JSONObject photo = new JSONObject().put("key", key).put("captureId", "native-" + key)
                .put("sequence", count() + 1).put("fileName", String.format(java.util.Locale.ROOT, "%03d.jpg", count() + 1))
                .put("timestamp", Instant.now().toString()).put("width", image.getWidth()).put("height", image.getHeight())
                .put("bytes", jpeg.length).put("source", "android-camerax");
            session.getJSONArray("photos").put(photo);
            session.put("transferred", false);
            try { persist(); } catch (Exception failure) {
                session.getJSONArray("photos").remove(count() - 1);
                throw failure;
            }
        } catch (Exception error) {
            photoFile(key).delete();
            thumbnailFile(key).delete();
            throw error;
        } finally {
            if (thumbnail != null && thumbnail != image) thumbnail.recycle();
            if (image != null && image != upright) image.recycle();
            if (upright != decoded) upright.recycle();
            decoded.recycle();
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
