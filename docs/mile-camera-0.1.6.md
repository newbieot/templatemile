# Mile Camera 0.1.6 dan CN23 Helper 0.2.1

Unduh [APK 0.1.6](https://mile.posnew.com/downloads/Mile-Camera-0.1.6.apk), lalu pilih **Perbarui** pada HP. Tidak perlu menghapus aplikasi lama; application ID dan sertifikat rilis tetap sama.

Shutter sekarang membekukan frame live yang sudah diterima pada sentuhan pertama (finger down), sebelum animasi, kompresi, dan penyimpanan. Menggeser label sesudah feedback tidak mengubah isi foto yang dibekukan. Tidak ada antrean `takePicture()` yang baru mengambil gambar setelah label dipindahkan. Tombol kembali siap ketika ada frame baru; frame hilang, lebih tua dari 250 ms sejak diterima, atau sudah dipakai tidak diambil ulang. Fokus dan cahaya tetap mengikuti kamera HP. Galeri menampilkan JPEG pada resolusi penuh, tanpa mengecilkannya menjadi separuh resolusi lebih dahulu. Batas 720p dan 120 KB per foto tetap berlaku.

Implementasi memakai Preview + [CameraX ImageAnalysis KEEP_ONLY_LATEST](https://developer.android.com/media/camera/camerax/analyze), dua buffer YUV yang dipakai ulang, dan salinan frame tersendiri untuk tiap foto. Rotasi dan pencerminan kamera depan disimpan bersama frame. Log `MileCameraPerf` mencatat umur frame, waktu pembekuan, dan penyimpanan.

Mode Campuran, pencocokan kode pos nasional, pembacaan ulang foto yang terlewat, serta Excel Lokal Batam dan Antrean CN23 terpisah tetap tersedia.

## Memperbarui ekstensi

1. Unduh [CN23 Helper 0.2.1](https://mile.posnew.com/downloads/Mile-CN23-Helper-0.2.1.zip).
2. Saat antrean tidak berjalan, ekstrak dan timpa file dalam **folder ekstensi lama**. Jangan uninstall atau mengganti folder/profil Chrome, supaya riwayat kiriman dan resi tetap tersimpan.
3. Buka `chrome://extensions`, klik **Reload/Muat ulang**. Pastikan versinya 0.2.1.
4. Setelah transaksi aktif selesai dan resinya sudah dipastikan, buka form CN23 kosong dan muat ulang tab Mile. Klik ikon → Upload Excel → Start.

Menu pembayaran dibuka melalui wrapper `.select-payment`, input difokuskan, dan pembukaan diulang jika transisi dialog mengabaikan klik pertama. Daftar yang dipindahkan Element UI ke luar dialog tetap dikenali. Cash/Invoice/CREDIT mengikuti Excel. Sebelum mengisi kiriman berikutnya, ekstensi menunggu seluruh kolom utama terlihat, unik, tidak sedang loading, dan stabil; `#ref_no` yang belum dipasang tidak langsung dianggap error. Sinyal kesiapan awal halaman yang sedang diisi tidak dipakai untuk memulai kiriman berikutnya. Kiriman berikutnya tetap menunggu resi baru yang cocok dan form baru kosong; hasil submit yang belum pasti tidak diulang otomatis.

## Validasi

Uji DOM ekstensi mencakup klik pembayaran pertama yang diabaikan, dropdown di luar dialog, Cash/Invoice/CREDIT, dan kolom referensi yang terlambat dipasang dengan salinan lama tersembunyi. Uji integrasi tiga kiriman memakai script form, background antrean, dan pembaca resi bersama: satu Start, ritel Cash, korporat Invoice, korporat CREDIT, Enter pelanggan, resi sebelum/sesudah redirect, form baru dengan referensi terlambat, tiga submit tunggal, dan satu notifikasi selesai. Uji tambahan memastikan sinyal kesiapan halaman lama tidak digunakan kembali, penyimpanan status mendahului Selesai, serta submit ganda dicegah.

Unit test Android mencakup salinan frame yang tidak berubah setelah buffer dipakai ulang, crop/stride/offset YUV, rotasi, pencerminan, frame kedaluwarsa, dan pemakaian buffer bersamaan. Instrumentation menguji capture 720p, beberapa foto berurutan, dan pergantian label setelah finger down sebelum finger up. Uji ini menggunakan emulator; ketajaman optik di HP dan transaksi produksi dengan ekstensi terpasang perlu diverifikasi pada perangkat pengguna.

[Source APK](https://mile.posnew.com/downloads/Mile-Camera-0.1.6-source.zip) tidak menyertakan keystore, password, SDK, atau hasil build lokal. Android minimum 8.0; versionCode 7. Sertifikat SHA-256: `eb9585f3fe6f601da93b23e5ba9e24b7a4958d23b5edce0e90908424af89e491`.
