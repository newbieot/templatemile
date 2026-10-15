# Mile Camera 0.1.9 — Foto terbaca dan AI langsung bekerja

Pasang [APK 0.1.9](https://mile.posnew.com/downloads/Mile-Camera-0.1.9.apk) sebagai pembaruan. Application ID dan sertifikat rilis tetap sama; versionCode 10. Riwayat batch dan PDF versi sebelumnya tetap tersimpan.

## Gelap bukan berarti buram

Deteksi kini menormalkan kontras sebelum memeriksa ketajaman, memakai ambang yang lebih toleran, dan menerima tulisan yang masih terbaca walaupun gelap atau sedikit kurang tajam. Pemeriksaan ini merupakan perkiraan; hanya foto yang sangat tidak jelas atau nyaris tanpa detail yang ditandai. Penanda dari algoritma lama dinilai ulang sebelum AI.

Di Galeri, foto yang ditandai memiliki tombol **Gambar tidak buram**. Gunakan bila teks masih terbaca; konfirmasi disimpan untuk foto tersebut, tidak mengubah JPEG, dan tetap berlaku setelah aplikasi dibuka ulang atau foto diperiksa kembali. Saat AI tertahan pada pemeriksaan foto, tombol ini otomatis melanjutkan AI. Saat hanya memeriksa Galeri di tengah capture, tombol ini kembali ke foto sehingga pengguna dapat melanjutkan capture. **Ambil ulang foto** tetap tersedia untuk foto yang memang tidak terbaca.

## Selesai langsung ke AI

**Selesai** menyimpan foto dan PDF di riwayat, memunculkan notifikasi singkat **PDF tersimpan otomatis**, lalu langsung menyiapkan dan menjalankan AI. Tidak ada dialog yang meminta pengguna menekan Proses AI lagi. Jika ada foto yang sangat tidak jelas, pengguna dapat mengambil ulang atau mengonfirmasi bahwa gambar masih terbaca. Shutter tetap membekukan frame saat disentuh; pemeriksaan foto dan PDF berjalan pada worker.

## Gemini 3.8 → DeepSeek 4.1

Untuk gambar kamera di Android dan web, Gemini 3.8 Flash diberi waktu maksimal **35 detik** pada browser dan gateway, termasuk membaca respons lengkap. Jika timeout, error, atau hasil tidak valid, kelompok itu langsung memakai **DeepSeek 4.1 Flash**; Gemini 3.1 Pro dan 3.7 tidak lagi berada di jalur fallback otomatis kamera. DeepSeek tetap mendapat anggaran 30 detiknya sendiri. Retry kompatibilitas schema/reasoning berbagi sisa 35 detik Gemini, sehingga tidak memperpanjang batas. Kelompok yang sudah berhasil tidak diulang; kelompok antrean melewati model yang telah gagal. Pemrosesan PDF dokumen biasa mempertahankan kebijakannya.

## Build dan verifikasi

[Source Android](https://mile.posnew.com/downloads/Mile-Camera-0.1.9-source.zip) menyertakan tes foto gelap/kontras rendah/bayangan, blur berat, konfirmasi persisten, migrasi penanda lama, dan alur Selesai/PDF/AI tanpa dialog. Tes browser/gateway memajukan waktu secara terkendali untuk memastikan perpindahan langsung pada batas 35 detik, retry tidak memperpanjang waktu, dan pembatalan respons server macet tetap berjalan.

Android minimum 8.0. Sertifikat SHA-256: `eb9585f3fe6f601da93b23e5ba9e24b7a4958d23b5edce0e90908424af89e491`. Metadata update serta hash APK dipublikasikan bersama build di `/api/android/update`.
