# Mile Camera 0.1.7

Unduh [APK 0.1.7](https://mile.posnew.com/downloads/Mile-Camera-0.1.7.apk), lalu pilih **Perbarui** di Android. Application ID dan sertifikat sama dengan rilis sebelumnya; foto batch serta login tetap tersimpan.

## Foto buram wajib diambil ulang

Shutter tetap membekukan frame pada sentuhan pertama, sebelum feedback. Analisis ketajaman berjalan pada worker foto setelahnya, tanpa menunggu jaringan atau AI. Capture berurutan tetap tersedia.

Foto yang terdeteksi buram disimpan pada urutannya dan diberi penanda. **Selesai / Proses AI** membuka foto yang perlu diambil ulang dan belum mengirim batch. Di Galeri, tekan **Ambil ulang foto**, fokuskan teks, lalu capture kembali. Foto yang tajam mengganti slot semula; foto ulang yang masih buram tidak mengganti foto semula. Semua foto yang ditandai harus diambil ulang sebelum batch diteruskan. Draft versi lama diperiksa di worker saat pengguna melanjutkan proses AI.

Deteksi memakai kontras dan lebar tepi teks pada beberapa area, dengan pengurangan noise dan pemeriksaan kedua arah untuk blur gerakan. Deteksi gambar adalah perkiraan, bukan jaminan semua tulisan terbaca; uji lensa, pencahayaan, dan stabilitas di HP tetap diperlukan.

## Pesan update aplikasi

Aplikasi memeriksa metadata rilis publik saat aktif, paling sering sekali setiap lima menit, tanpa membawa akun atau cookie login. Saat versi dengan versionCode lebih besar tersedia, pesan **Update Mile Camera tersedia** muncul di beranda atau login; capture dan pemeriksaan foto tidak dipotong oleh dialog. **Unduh update** membuka APK resmi lewat browser. Tombol **Periksa update** juga tersedia di beranda.

Untuk rilis berikutnya, naikkan versionCode/versionName, tanda tangani APK memakai keystore yang sama, dan perbarui `downloads/mile-camera-update.json` dengan applicationId, versi, URL HTTPS resmi, SHA-256, dan ukuran file. Publikasikan metadata beserta APK pada deploy yang sama. Endpoint `/api/android/update` tidak memakai cache. APK sebelum 0.1.7 harus diperbarui sekali agar mendapat fitur pemberitahuan ini.

## Kelompok hasil

Di Periksa Hasil, klik **Lokal Batam** atau **Luar kota / CN23** untuk menampilkan data kelompok itu. Nomor urut sumber dan perubahan berat/alamat tetap tersimpan. **Semua** mengembalikan seluruh data. **Unduh Excel** selalu mengekspor seluruh batch menjadi satu atau dua file sesuai kelompok yang ada, termasuk saat tampilan sedang difilter. Fitur tersedia di web serta WebView Android.

## Build dan pengujian

Android minimum 8.0; versionCode 8. Sertifikat SHA-256: `eb9585f3fe6f601da93b23e5ba9e24b7a4958d23b5edce0e90908424af89e491`.

[Source APK](https://mile.posnew.com/downloads/Mile-Camera-0.1.7-source.zip) memuat kode, wrapper Gradle, dan tes; tidak memuat keystore, password, SDK, atau output build lokal. Lihat `android/README.md` untuk build dan tes JVM/emulator.
