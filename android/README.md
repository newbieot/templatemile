# Mile Camera Android

Aplikasi pendamping Android dengan kamera native CameraX. Login, ekstraksi AI, pemeriksaan hasil, dan sinkronisasi desktop memakai aplikasi MILE yang sudah berjalan di `https://mile.posnew.com`.

## Memakai APK

Unduh APK: https://mile.posnew.com/downloads/Mile-Camera-0.1.0.apk

1. Salin `Mile-Camera-0.1.0.apk` ke HP, buka, dan izinkan pemasangan dari aplikasi pengirim/file manager bila diminta Android.
2. Buka **Mile Camera**, pilih **Mulai capture**, lalu izinkan kamera.
3. Ketuk bagian teks untuk fokus. Indikator biru berarti perangkat melaporkan fokus berhasil; indikator kuning berarti fokus belum terkunci atau lensa tidak mendukung autofocus pada titik.
4. Ambil foto, periksa **Galeri**, hapus yang tidak layak, lalu tekan **Selesai**.
5. Login ke MILE bila diminta. Foto disimpan ke sesi review yang sama dengan pipeline web, lalu diproses oleh Gemini 3.8 → Gemini 3.1 Pro → Gemini 3.7 → DeepSeek 4.1 Flash, 7 gambar × 7 jalur, maksimal 30 detik per model.
6. Foto asli dalam aplikasi tetap tersedia sampai pengguna menghapusnya atau memulai batch baru. Memulai batch baru meminta konfirmasi; hasil MILE yang sudah disimpan tidak dihapus.

Android 8.0 atau lebih baru. Kamera belakang diprioritaskan; perangkat tanpa kamera belakang memakai kamera depan. Kamera dengan lensa fokus tetap tidak bisa dibuat autofocus melalui perangkat lunak. Capture dapat dilakukan tanpa internet, tetapi login dan AI memerlukan koneksi.

## Kamera dan penyimpanan

- Preview dan still capture memakai CameraX, dengan autofocus bawaan, AF/AE metering pada koordinat ketukan, dan status hasil fokus yang sebenarnya.
- Saat capture, aplikasi menunggu respons fokus paling lama 1,6 detik sebelum melanjutkan pengambilan foto agar perangkat yang lambat tidak mengunci tombol selamanya.
- Zoom cubit, kembali ke zoom 1×, dan lampu bantu sesuai kemampuan kamera.
- Layout capture menyesuaikan portrait/landscape; tombol berada di dock samping ketika landscape.
- Rotasi memakai sensor HP dalam empat arah, termasuk saat pengaturan rotasi Android dikunci portrait (`fullSensor`). Galeri ikut menyesuaikan; foto yang sedang disimpan diselesaikan sebelum layout kamera dipasang ulang.
- Palet navy dan biru mengikuti web MILE.
- Still capture JPEG, orientasi EXIF dinormalisasi, sisi panjang maksimal 2048 px, maksimal 1500 KiB per foto. Ukuran dan kualitas adaptif menjaga 7 foto tetap di bawah anggaran gateway web.
- Draft dan foto tersimpan di ruang privat aplikasi. Manifest ditulis atomik. Tidak diperlukan izin penyimpanan umum, lokasi, atau mikrofon.
- WebView hanya menjalankan aplikasi pada origin HTTPS MILE. Tidak ada JavaScript interface native. Foto diberikan melalui rute lokal ber-token yang dicegat WebView; rute tersebut tidak dikirim ke server.
- Handoff selesai hanya setelah IndexedDB berhasil menyimpan batch. Gagal membaca foto, penyimpanan penuh, atau gagal koneksi mempertahankan draft native.
- Menghapus aplikasi/data aplikasi akan menghapus draft lokal serta sesi login/IndexedDB aplikasi.

## Build

Java 17/21, Android SDK platform 36 dan build tools 35.0.0. Gradle wrapper 8.13 tersedia di folder ini. Buat `local.properties` berisi `sdk.dir` sesuai lokasi SDK, atau gunakan `ANDROID_HOME`.

```powershell
cd android
.\gradlew.bat :app:assembleDebug :app:lintDebug
```

Untuk release bertanda tangan, set `MILE_SIGNING_FILE` dan `MILE_SIGNING_PASSWORD` di environment; keystore harus memiliki alias `mile-camera`. Lalu jalankan `:app:assembleRelease :app:lintRelease`. Keystore dan password tidak disimpan di repository. Keystore release untuk build pada komputer ini berada di `%LOCALAPPDATA%\MileCameraBuild\signing`; pertahankan untuk membuat pembaruan APK yang bisa dipasang tanpa menghapus aplikasi sebelumnya.

Build QA pada komputer ini menggunakan pengaturan JVM lokal untuk menghindari masalah Unix-domain socket Windows. Pengaturan tersebut hanya mempengaruhi Gradle, bukan APK.

## Verifikasi

`node tests/android-handoff.test.js` dari root repository memeriksa handoff 7 foto, JPEG, default model, kegagalan foto, kegagalan penyimpanan, dan penolakan origin yang tidak diizinkan. Build APK dan Android lint dijalankan sebelum hasil diberikan. Emulator dapat memverifikasi UI dan penyimpanan/capture virtual; autofocus dan kualitas optik tetap perlu diuji pada HP fisik.
