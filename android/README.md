# Mile Camera Android

Aplikasi pendamping Android dengan kamera native CameraX. Login, ekstraksi AI, pemeriksaan hasil, dan sinkronisasi desktop memakai aplikasi MILE yang sudah berjalan di `https://mile.posnew.com`.

## Memakai APK

Unduh APK terbaru: https://mile.posnew.com/downloads/Mile-Camera.apk (versi 0.1.9).

1. Unduh `Mile-Camera-0.1.9.apk` ke HP, buka, dan izinkan pemasangan dari aplikasi pengirim/file manager bila diminta Android. Sertifikat rilis sama dengan 0.1.1 sehingga dapat diperbarui tanpa menghapus aplikasi. APK yang ditandatangani pihak lain memerlukan pemeriksaan sertifikat dahulu.
2. Buka **Mile Camera** dan login terlebih dahulu. Kamera, galeri, dan halaman aplikasi terkunci sebelum login berhasil. Setelah masuk, pilih **Mulai capture** dan izinkan kamera.
3. Ketuk bagian teks untuk fokus. Indikator biru berarti perangkat melaporkan fokus berhasil; indikator kuning berarti fokus belum terkunci atau lensa tidak mendukung autofocus pada titik.
4. Ambil foto dan tekan **Selesai**. Foto dan PDF otomatis disimpan di riwayat tanpa izin/pemilih folder. Notifikasi singkat **PDF tersimpan otomatis** muncul, lalu AI langsung bekerja tanpa tombol konfirmasi. Foto gelap/kurang tajam yang masih terbaca boleh dipakai. Jika ditandai, pilih **Gambar tidak buram** untuk mengonfirmasi dan melanjutkan AI, atau **Ambil ulang foto** jika memang tidak terbaca.
5. Foto disimpan ke sesi review yang sama dengan pipeline web, lalu diproses oleh Gemini 3.8 → DeepSeek 4.1 Flash, 7 gambar × 7 jalur. Gemini 3.8 mendapat maksimal 35 detik dan langsung beralih ke DeepSeek bila gagal/timeout; DeepSeek mendapat 30 detik tersendiri. Retry kompatibilitas berbagi sisa waktu model yang sama.
6. **Riwayat batch · Foto & PDF** menyimpan tanggal/jam dan jumlah gambar setiap batch. Foto/PDF dapat dibuka atau diunduh dan AI dapat dijalankan untuk batch terpilih, tanpa mengganti draft baru. Batch lama disalin ke riwayat sebelum memulai batch baru; tidak ikut masa simpan log server.
7. Klik **Lokal Batam / Luar kota / CN23** di hasil untuk menampilkan kiriman kelompok tersebut, atau **Semua** untuk mengembalikan seluruh data. Ekspor tetap mencakup seluruh batch.
8. Versi baru diperiksa di background saat aplikasi aktif. Pesan update muncul di beranda/login dan membuka APK resmi; **Periksa update** juga tersedia di beranda. Fitur ini mulai tersedia pada APK 0.1.7.

Android 8.0 atau lebih baru. Kamera belakang diprioritaskan; perangkat tanpa kamera belakang memakai kamera depan. Kamera dengan lensa fokus tetap tidak bisa dibuat autofocus melalui perangkat lunak. Setelah login pertama, sesi tersimpan saat aplikasi ditutup atau HP direstart; capture bisa offline. Login, logout server, dan AI memerlukan koneksi. Bila logout gagal karena koneksi, aplikasi memberi tahu pengguna untuk mencoba kembali.

## Kamera dan penyimpanan

- Preview dan frame foto memakai CameraX Preview + ImageAnalysis KEEP_ONLY_LATEST, dengan autofocus bawaan, AF/AE metering pada koordinat ketukan, dan status hasil fokus yang sebenarnya.
- Shutter membekukan salinan frame yang sudah diterima pada finger down sebelum feedback. Kompresi dan penyimpanan berjalan sesudahnya; tidak meminta sensor mengambil gambar berikutnya. Frame yang sudah dipakai atau lebih tua dari 250 ms sejak diterima tidak difoto ulang. Autofokus kontinu tetap berjalan saat membidik, dan ketuk fokus tetap tersedia.
- Deteksi memakai normalisasi kontras pada worker sesudah frame dibekukan, sehingga gelap tidak disamakan dengan buram. Ambang toleran menerima foto yang masih terbaca; hanya foto sangat tidak jelas yang ditandai. Tidak menunggu pemeriksaan pada event shutter. Penanda lama dinilai ulang sebelum handoff. Konfirmasi Gambar tidak buram berlaku hanya pada foto yang dipilih, tidak mengubah JPEG, disimpan persisten, dan tidak dibatalkan oleh preflight berikutnya.
- Kilatan putih pada preview, getaran, serta suara shutter Android diberikan setelah frame dibekukan. Suara mengikuti volume/kebijakan audio HP. Status tersimpan muncul setelah JPEG berhasil ditulis. Galeri menampilkan resolusi JPEG penuh.
- Zoom cubit, kembali ke zoom 1×, dan lampu bantu sesuai kemampuan kamera.
- Kamera memenuhi area layar, dengan kontrol berupa overlay transparan. Landscape tidak memakai panel samping solid. Preview menjaga framing 16:9 utuh; perbedaan rasio layar bisa meninggalkan margin agar gambar tidak dipotong atau tampak zoom.
- Zoom awal dan setelah rotasi selalu 1×; cubit layar tetap bisa dipakai untuk zoom manual, dan tombol 1× mengembalikan zoom.
- Rotasi memakai sensor HP dalam empat arah, termasuk saat pengaturan rotasi Android dikunci portrait (`fullSensor`). Galeri ikut menyesuaikan; foto yang sedang disimpan diselesaikan sebelum layout kamera dipasang ulang.
- Palet navy dan biru mengikuti web MILE.
- Still capture JPEG 720p: maksimal 1280 × 720 landscape atau 720 × 1280 portrait, maksimal **120.000 byte (120 KB)** per foto. Kompresi JPEG adaptif mempertahankan resolusi dan memenuhi batas byte. Draft lama dikonversi atomik sebelum dipakai, termasuk normalisasi EXIF.
- Draft, riwayat, dan PDF otomatis tersimpan di ruang privat aplikasi. JPEG dan manifest ditulis atomik. Satu JPEG utuh per halaman PDF, tanpa kompresi ulang; penulisan streaming tidak menahan seluruh bitmap dalam memori. PDF yang terpotong dibuat ulang, dan retake menghasilkan PDF sesuai foto terbaru.
- Penyimpanan otomatis tidak memerlukan izin. **Unduh PDF** menggunakan MediaStore Downloads pada Android 10+, atau meminta WRITE_EXTERNAL_STORAGE pada Android 8–9 saja. FileProvider tidak diekspor dan memberi pembaca PDF izin sementara hanya untuk file yang dibuka. Tidak ada izin lokasi, mikrofon, atau akses seluruh berkas.
- WebView hanya menjalankan aplikasi pada origin HTTPS MILE. Tidak ada JavaScript interface native. Foto diberikan melalui rute lokal ber-token yang dicegat WebView; rute tersebut tidak dikirim ke server.
- Login dilakukan lewat form Android dan endpoint HTTPS yang memverifikasi Firebase serta allowlist. Token sesi persisten disimpan terenkripsi dengan Android Keystore; password tidak disimpan. Sesi server berada di R2 `auth/android-sessions/` tanpa expiry dan dihapus ketika logout berhasil. Lifecycle bucket hanya mengekspirasikan prefix `beta/`, bukan sesi login. Sesi web biasa tetap 12 jam/7 hari.
- Handoff selesai hanya setelah IndexedDB berhasil menyimpan batch. Gagal membaca foto, penyimpanan penuh, atau gagal koneksi mempertahankan draft native.
- Menghapus aplikasi/data aplikasi akan menghapus draft, riwayat/PDF privat, dan sesi login/IndexedDB aplikasi. Salinan yang sudah diunduh ke Download tetap merupakan berkas terpisah.

## Build

Java 17/21, Android SDK platform 36 dan build tools 35.0.0. Gradle wrapper 8.13 tersedia di folder ini. Buat `local.properties` berisi `sdk.dir` sesuai lokasi SDK, atau gunakan `ANDROID_HOME`.

```powershell
cd android
.\gradlew.bat :app:assembleDebug :app:lintDebug
```

Untuk release bertanda tangan, set `MILE_SIGNING_FILE` dan `MILE_SIGNING_PASSWORD` di environment; keystore harus memiliki alias `mile-camera`. Lalu jalankan `:app:assembleRelease :app:lintRelease`. Keystore dan password tidak disimpan di repository. Keystore release untuk build pada komputer ini berada di `%LOCALAPPDATA%\MileCameraBuild\signing`; pertahankan untuk membuat pembaruan APK yang bisa dipasang tanpa menghapus aplikasi sebelumnya.

Build QA pada komputer ini menggunakan pengaturan JVM lokal untuk menghindari masalah Unix-domain socket Windows. Pengaturan tersebut hanya mempengaruhi Gradle, bukan APK.

## Verifikasi

`:app:testDebugUnitTest` menguji blur defocus, blur gerakan dua arah, noise, tulisan kontras rendah, frame shutter, serta validasi URL/versi update. `npm test --prefix tests` memeriksa handoff, blokir foto buram, filter hasil, ekspor kedua kelompok, endpoint update, hash APK, autentikasi, sesi persisten, dan timeout AI.

Tes Android ada di `src/androidTest`. Build `:app:assembleDebug :app:assembleDebugAndroidTest`, instal keduanya ke emulator, berikan izin kamera kepada paket `.preview`, lalu jalankan:

```text
adb shell am instrument -w -e class com.posnew.milecamera.AndroidSessionTest,com.posnew.milecamera.LoginGateTest,com.posnew.milecamera.SessionStoreTest,com.posnew.milecamera.PhotoSafetyTest,com.posnew.milecamera.BatchHistoryTest,com.posnew.milecamera.BatchHistoryUiTest com.posnew.milecamera.preview.test/android.test.InstrumentationTestRunner
adb shell am instrument -w -e class 'com.posnew.milecamera.CameraCaptureTest#testImmediateFeedbackAnd720pCaptureAtOneX' com.posnew.milecamera.preview.test/android.test.InstrumentationTestRunner
adb shell am instrument -w -e class 'com.posnew.milecamera.CameraCaptureTest#testRapidRepeatedCapturePersistsEveryPhotoInOrder' com.posnew.milecamera.preview.test/android.test.InstrumentationTestRunner
adb shell am instrument -w -e class 'com.posnew.milecamera.CameraCaptureTest#testTouchDownFreezesLabelBeforeReleaseAndSaving' com.posnew.milecamera.preview.test/android.test.InstrumentationTestRunner
```

Harness kamera hanya ada dalam build debug, tidak disertakan di APK release. Tes kamera dijalankan pada proses terpisah agar sensor virtual dilepas di antara tes; menjalankan semuanya dalam satu proses dapat membuat preview emulator tidak tersambung kembali. Emulator memverifikasi UI, penyimpanan, dan capture virtual; autofocus optik, kecepatan perangkat, serta suara di HP fisik tetap perlu diuji.

Tes BatchHistory memakai PdfRenderer Android untuk memeriksa jumlah halaman, orientasi, urutan/pixel gambar, PDF 150 halaman, pemulihan PDF terpotong, penyimpanan ulang, retake, unduhan MediaStore, serta kegagalan arsip yang tidak boleh menghapus draft. Tes UI memverifikasi Selesai sudah menyimpan PDF dan memulai pemeriksaan AI tanpa dialog tambahan; konfirmasi Gambar tidak buram melanjutkan ke WebView untuk batch yang benar tanpa menimpa draft baru. WebView pada fixture diblokir dari jaringan agar tidak mengirim foto uji ke AI sungguhan.

Untuk rilis berikutnya, lihat prosedur metadata update di `docs/mile-camera-0.1.7.md`, riwayat di `docs/mile-camera-0.1.8.md`, dan alur terbaru di `docs/mile-camera-0.1.9.md`. Deploy APK dan `downloads/mile-camera-update.json` bersama-sama agar aplikasi yang sudah terpasang dapat menawarkan versi baru.
