# Mile Camera 0.1.3

Pembaruan ini memakai source `Mile-Camera-0.1.2-source.zip` dari pengguna, mempertahankan capture JPEG di memori, antrean penyimpanan berurutan, respons tombol langsung, dan Zero Shutter Lag pada kamera yang mendukungnya. Perangkat lain memakai mode minimize latency. Tidak ada jeda autofocus tetap sebelum shutter; kecepatan sensor/penyimpanan tetap mengikuti HP.

## Instalasi di HP

1. Unduh `Mile-Camera-0.1.3.apk`, buka lewat Files/File Manager atau unduhan browser.
2. Jika Android meminta izin, izinkan pemasangan dari aplikasi yang digunakan untuk membuka APK.
3. Pilih **Update/Perbarui**. Sertifikat dan application ID sama dengan versi 0.1.1. Jangan menghapus aplikasi lama agar draft dan sesi tetap tersedia. Jika APK lama ditandatangani pihak lain dan Android menolak update, simpan hasil/draft dahulu dan periksa versi lama sebelum menghapus apa pun.
4. Buka Mile Camera. Pilih **Lokal Batam**, **Luar Kota Batam · CN23 Dokumen**, atau **Campuran · Lokal + Luar Kota** sebelum foto pertama. Mode dikunci ketika draft berisi foto.
5. Capture label, lalu **Proses AI**. Foto tetap tersimpan di HP jika proses gagal.
6. Di web review, periksa isian dan wilayah/kode pos. Pencarian memakai database nasional, bukan OCR offline dalam APK. Nama wilayah ganda atau kode pos bertentangan harus dipilih petugas sebelum ekspor.
7. Campuran menghasilkan **Excel Lokal Batam** dan **Antrean CN23** dalam dua file terpisah. Excel lokal diproses melalui upload Mile seperti biasa; Excel CN23 diimpor melalui ekstensi Chrome pada komputer loket.
8. Log kamera menampilkan jumlah **Lokal Batam**, **Luar Kota Batam**, dan **Tujuan belum pasti**, bersama jumlah baris yang perlu diperiksa.

APK memerlukan Android 8.0 atau lebih baru. Capture dapat digunakan tanpa internet setelah login; AI, database nasional di web, dan sinkronisasi memerlukan koneksi.

## Verifikasi rilis

- Release `assembleRelease` dan `lintRelease` berhasil. APK 5.288.817 byte, application ID `com.posnew.milecamera`, versionCode 4.
- Sertifikat SHA-256 sama dengan APK 0.1.1: `eb9585f3fe6f601da93b23e5ba9e24b7a4958d23b5edce0e90908424af89e491`.
- Sepuluh tes Android `SessionStoreTest` dan `CameraCaptureTest` lulus pada emulator. Termasuk persistensi mode, penguncian mode setelah capture, batch baru, migrasi draft, batas JPEG/rotasi, dan tiga capture cepat yang tersimpan berurutan.
- Handoff native diuji untuk ketiga mode; web lama yang belum memiliki dukungan nasional menahan batch luar kota/Campuran sebelum foto dipindahkan.
- Autofocus optik dan latensi Zero Shutter Lag perlu diuji pada HP fisik. Emulator menguji fallback dan ketepatan penyimpanan, bukan kecepatan sensor HP.

Source yang dapat dibangun kembali disertakan tanpa keystore, password, SDK lokal, atau hasil build. Ikuti `android/README.md` untuk setup Java/SDK dan penandatanganan dengan sertifikat milik operator.
