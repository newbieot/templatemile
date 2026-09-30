# Mile Camera 0.1.1 — verifikasi

Build 30 September 2026, paket com.posnew.milecamera, versionCode2, Android8+.

- Build release/debug/tes dan lint release berhasil, tanpa lint error.
- APK release ditandatangani keystore yang sama dengan versi0.1.0; bisa diperbarui tanpa uninstall.
- 12 tes Android lulus: login wajib dan tidak bisa dilewati native entry, sesi tersimpan terenkripsi dan dipulihkan setelah restart, logout lokal/tamper, JPEG noisy ≤120000byte pada720p, EXIF, migrasi draft lama/interruptedwrite, serta capture kamera virtual.
- Empat suite Node lulus: sesi Android persisten/backend logout revocation/tamper/storage errors, nativehandoff termasuk ukuran/resolusi, gate route kamera, dan anggaran AI30detik.
- Emulator Android15 Pixel5: preview fullscreen dengan overlay; landscape mengikuti sensor saat rotasi sistem dikunci portrait. Zoom1× diverifikasi, framing16:9 dipertahankan tanpa crop mengikuti rasio layar.
- Umpan balik shutter diterima23–224ms, JPEG virtual disimpan433–692ms dalam tes emulator. Ini hasil virtual, bukan jaminan kecepatan perangkat fisik.
- Efek kilatan preview180ms, haptic, dan MediaActionSound.SHUTTER_CLICK tersedia. Emulator berjalan tanpa audiohost; suara dan autofocus optik perlu dicoba diHP.
- APK release upgrade tampil login lebih dulu. Form Android memakai backend Firebase/allowlist; password tidak disimpan, token dienkripsi Keystore.
- R2 lifecycle produksi diperiksa: expire-beta-images hanya prefix beta/ (1hari); auth/android-sessions/ tanpa expiry. Logout server menghapus record token.
- Login positif dengan akun pengguna dan AI real belum diuji di emulator karena tidak memakai password pengguna. Verifikasi alur backend menggunakan Firebase/R2 mock dan gate/native persistence dengan instrumentasi.
- Harness kamera hanya dalam build debug, tidak dalam APK release.

APK: downloads/Mile-Camera-0.1.1.apk. Tautan stabil: https://mile.posnew.com/downloads/Mile-Camera.apk

SHA256: 3e13ded4ab74da50002888e6c5467113193318e9e88b27104a07f766f7ffc33b
