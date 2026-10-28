# Mile Camera 0.1.9 — Foto terbaca dan AI langsung bekerja

Pasang [APK 0.1.9](https://mile.posnew.com/downloads/Mile-Camera-0.1.9.apk) sebagai pembaruan. Application ID dan sertifikat rilis tetap sama; versionCode 10. Riwayat batch dan PDF versi sebelumnya tetap tersimpan.

## Gelap bukan berarti buram

Deteksi kini menormalkan kontras sebelum memeriksa ketajaman, memakai ambang yang lebih toleran, dan menerima tulisan yang masih terbaca walaupun gelap atau sedikit kurang tajam. Pemeriksaan ini merupakan perkiraan; hanya foto yang sangat tidak jelas atau nyaris tanpa detail yang ditandai. Penanda dari algoritma lama dinilai ulang sebelum AI.

Di Galeri, foto yang ditandai memiliki tombol **Gambar tidak buram**. Gunakan bila teks masih terbaca; konfirmasi disimpan untuk foto tersebut, tidak mengubah JPEG, dan tetap berlaku setelah aplikasi dibuka ulang atau foto diperiksa kembali. Saat AI tertahan pada pemeriksaan foto, tombol ini otomatis melanjutkan AI. Saat hanya memeriksa Galeri di tengah capture, tombol ini kembali ke foto sehingga pengguna dapat melanjutkan capture. **Ambil ulang foto** tetap tersedia untuk foto yang memang tidak terbaca.

## Selesai langsung ke AI

**Selesai** menyimpan foto dan PDF di riwayat, memunculkan notifikasi singkat **PDF tersimpan otomatis**, lalu langsung menyiapkan dan menjalankan AI. Tidak ada dialog yang meminta pengguna menekan Proses AI lagi. Jika ada foto yang sangat tidak jelas, pengguna dapat mengambil ulang atau mengonfirmasi bahwa gambar masih terbaca. Shutter tetap membekukan frame saat disentuh; pemeriksaan foto dan PDF berjalan pada worker.

## Model OCR web terbaru

Review web yang dibuka APK mengikuti konfigurasi server terbaru. Mulai v26.56, default adalah **Gemini 3.8 Flash**, dengan fallback **Claude Haiku 5.5 → Claude Sonnet 5**. Gateway memberi Gemini 120 detik dan Claude 150 detik, termasuk membaca respons lengkap; browser menambahkan toleransi transport 15 detik. Retry kompatibilitas kamera berbagi sisa anggaran model yang sama. Kelompok yang sudah berhasil dipertahankan, dan antrean melewati model yang gagal. [Katalog OCR dan verifikasi](ocr-models-20261028.md).

## Build dan verifikasi

[Source Android](https://mile.posnew.com/downloads/Mile-Camera-0.1.9-source.zip) menyertakan tes foto gelap/kontras rendah/bayangan, blur berat, konfirmasi persisten, migrasi penanda lama, dan alur Selesai/PDF/AI tanpa dialog. Tes browser/gateway di repository memajukan waktu secara terkendali untuk memeriksa batas terbaru, anggaran retry bersama, dan pembatalan respons server yang macet.

Android minimum 8.0. Sertifikat SHA-256: `eb9585f3fe6f601da93b23e5ba9e24b7a4958d23b5edce0e90908424af89e491`. Metadata update serta hash APK dipublikasikan bersama build di `/api/android/update`.
