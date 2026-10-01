# Mile Camera 0.1.2 — audit shutter latency

Tanggal audit: 1 Oktober 2026.

## Perubahan utama

- CameraX memakai `CAPTURE_MODE_ZERO_SHUTTER_LAG` bila kamera melaporkan dukungan ZSL; perangkat lain tetap memakai `CAPTURE_MODE_MINIMIZE_LATENCY`.
- Output dipaksa JPEG SDR dan diambil melalui `ImageCapture.takePicture(Executor, OnImageCapturedCallback)` agar hasil kamera diterima sebagai `ImageProxy` tanpa menunggu temporary-file write.
- `ImageProxy` disalin ke byte array dan ditutup segera pada callback kamera. Rotasi, crop 16:9, resize 720p, kompresi <= 120.000 byte, thumbnail, atomic write, dan update manifest dikerjakan setelahnya pada executor background.
- Tidak ada siklus autofocus baru yang ditunggu saat shutter ditekan. Tap-to-focus tetap memakai AF/AE metering dengan auto-cancel 3 detik sehingga kontrol kembali ke perilaku autofocus CameraX setelah tap focus selesai.
- UI tidak lagi ikut menunggu lock selama decode/re-encode JPEG. `SessionStore` hanya mengunci commit singkat setelah encoding selesai.
- Burst manual aman: sampai 3 capture request dapat berada di pipeline kamera dan sampai 6 hasil belum selesai disimpan. Hasil callback dikoordinasikan berdasarkan urutan tap sebelum masuk single-thread save queue.
- Feedback dibagi sesuai fase: animasi shutter + haptic langsung saat tap diterima; suara shutter + flash preview saat CameraX memanggil `onCaptureStarted()`.
- Log performa per foto memakai tag `MileCameraPerf`.

## Metrik runtime

Per foto dicatat:

- `tapToRequestMs`: tap sampai tepat sebelum `ImageCapture.takePicture()` dipanggil.
- `requestCallMs`: durasi pemanggilan API `takePicture()` sampai kembali ke caller.
- `tapToCaptureStartedMs`: tap sampai callback `onCaptureStarted()`.
- `tapToCaptureResultMs`: tap sampai `onCaptureSuccess()`/`onError()`.
- `captureResultToSavedMs`: callback hasil capture sampai kompresi + thumbnail + final storage selesai.
- `tapToSavedMs`: total tap sampai final storage selesai.
- `sensorTimestampNs`: timestamp monotonic dari `ImageInfo`; disimpan untuk diagnosis, bukan dibandingkan langsung dengan wall-clock UTC.

ADB:

```text
adb logcat -s MileCameraPerf:I
```

## Verifikasi yang benar-benar dilakukan di environment ini

- Source asli diekstrak dan alur shutter/CameraX/SessionStore diaudit file per file.
- Dokumentasi API CameraX diverifikasi untuk ZSL, `isZslSupported()`, in-memory `ImageProxy`, format JPEG, `onCaptureStarted()`, dan kewajiban `ImageProxy.close()`.
- Pemeriksaan sintaks parser Java dijalankan dengan `javac -proc:none`; tidak ditemukan error sintaks Java. Android symbols tidak dapat di-resolve tanpa Android SDK/dependency classpath.
- Percobaan build Gradle dilakukan. Build tidak dapat dimulai karena Gradle wrapper 8.13 belum tersedia di container dan container tidak dapat mengakses `services.gradle.org` (`UnknownHostException`).
- ZIP hasil source diuji integritasnya setelah packaging.

## Tes yang ditambahkan tetapi belum dapat dijalankan di environment ini

- `CameraCaptureTest.testRapidRepeatedCapturePersistsEveryPhotoInOrder`: tiga tap cepat, memastikan semua foto tersimpan, sequence 1..3, `captureId` unik, dan setiap file <=120.000 byte.
- `SessionStoreTest.testInMemoryCameraCaptureIsRotatedCompressedAndKeepsIdentity`: fast path byte-array, rotasi portrait, batas byte, capture identity, dan timestamp.
- Test existing immediate shutter/720p diperbarui untuk memeriksa feedback tap yang langsung, bukan flash layar sebelum sensor benar-benar memulai capture.

## Yang wajib diuji di HP fisik

1. Latensi pada HP yang mendukung ZSL dan HP yang tidak mendukung ZSL, minimal 20 capture per perangkat.
2. Autofocus kontinu pada dokumen dekat/jauh, lalu tap-to-focus, lalu shutter cepat tanpa menunggu fokus ulang.
3. Tiga sampai enam tap cepat pada perangkat low-end untuk memastikan tidak ada lost frame, duplikasi, atau urutan tertukar.
4. Torch ON/OFF, rotasi landscape kiri/kanan, kamera belakang dan fallback kamera depan bila relevan.
5. Suara shutter mengikuti volume/kebijakan regional perangkat; beberapa perangkat dapat memaksa suara shutter.
6. Kondisi storage hampir penuh dan app masuk background saat foto masih diproses.
7. Login persisten sampai logout dan handoff WebView setelah batch selesai, untuk memastikan perubahan kamera tidak menimbulkan regresi pada sesi.

## Batasan latensi

Latensi nol tidak dapat dijamin. Sensor exposure, AE/AWB/AF state, ISP/JPEG hardware, scheduler Android, thermal state, dan implementasi Camera2 OEM berbeda antar perangkat. Pada ZSL, CameraX dapat memilih frame dari ring buffer yang timestamp-nya paling dekat dengan saat `takePicture()` dipanggil; pada fallback MINIMIZE_LATENCY, perangkat tetap membutuhkan waktu exposure + processing sebelum `onCaptureSuccess()`.
