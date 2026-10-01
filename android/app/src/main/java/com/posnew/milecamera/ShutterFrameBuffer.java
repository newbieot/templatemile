package com.posnew.milecamera;

import java.nio.ByteBuffer;

/** Two reusable live buffers; only an accepted shutter clones a frame for immutable saving. */
final class ShutterFrameBuffer {
    static final long MAX_AGE_NS = 250_000_000L;
    private byte[] latest, spare;
    private int width, height, rotation;
    private boolean mirror;
    private long arrivedNs, sensorNs, capturedSensorNs = Long.MIN_VALUE;

    // Called by exactly one analyzer thread. Plane positions/strides may differ by device.
    void publish(ByteBuffer y, int yRow, int yPixel, ByteBuffer u, int uRow, int uPixel,
                 ByteBuffer v, int vRow, int vPixel, int left, int top, int frameWidth,
                 int frameHeight, int rotationDegrees, boolean flip, long timestamp, long arrival) {
        if ((left | top | frameWidth | frameHeight) % 2 != 0 || frameWidth < 2 || frameHeight < 2)
            throw new IllegalArgumentException("Crop YUV harus genap.");
        int size = Math.multiplyExact(frameWidth, frameHeight) * 3 / 2;
        byte[] next;
        synchronized (this) { next = spare != null && spare.length == size ? spare : new byte[size]; spare = null; }
        copyLuma(y.duplicate(), yRow, yPixel, left, top, frameWidth, frameHeight, next);
        int offset = frameWidth * frameHeight, uBase = u.position(), vBase = v.position();
        for (int row = 0; row < frameHeight / 2; row++) {
            int ui = uBase + (top / 2 + row) * uRow + left / 2 * uPixel;
            int vi = vBase + (top / 2 + row) * vRow + left / 2 * vPixel;
            for (int col = 0; col < frameWidth / 2; col++) {
                next[offset++] = v.get(vi + col * vPixel);
                next[offset++] = u.get(ui + col * uPixel);
            }
        }
        synchronized (this) {
            spare = latest; latest = next;
            width = frameWidth; height = frameHeight; rotation = rotationDegrees; mirror = flip;
            arrivedNs = arrival; sensorNs = timestamp;
        }
    }

    private static void copyLuma(ByteBuffer plane, int stride, int pixel, int left, int top,
                                 int width, int height, byte[] output) {
        int base = plane.position();
        for (int row = 0; row < height; row++) {
            int source = base + (top + row) * stride + left * pixel;
            if (pixel == 1) { plane.position(source); plane.get(output, row * width, width); }
            else for (int col = 0; col < width; col++) output[row * width + col] = plane.get(source + col * pixel);
        }
    }

    synchronized boolean available(long now) {
        return latest != null && now >= arrivedNs && now - arrivedNs <= MAX_AGE_NS && sensorNs != capturedSensorNs;
    }

    synchronized Snapshot freeze(long now) {
        if (!available(now)) return null; // Never queue a later frame or duplicate the previous label.
        Snapshot result = new Snapshot(latest.clone(), width, height, rotation, mirror, sensorNs, now - arrivedNs);
        capturedSensorNs = sensorNs;
        return result;
    }

    synchronized void clear() { latest = spare = null; capturedSensorNs = Long.MIN_VALUE; }

    static final class Snapshot {
        final byte[] nv21;
        final int width, height, rotation;
        final boolean mirror;
        final long sensorNs, ageNs;
        Snapshot(byte[] nv21, int width, int height, int rotation, boolean mirror, long sensorNs, long ageNs) {
            this.nv21 = nv21; this.width = width; this.height = height; this.rotation = rotation;
            this.mirror = mirror; this.sensorNs = sensorNs; this.ageNs = ageNs;
        }
    }
}
