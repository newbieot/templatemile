# Mile Camera 0.1.8 — Riwayat batch dan PDF otomatis

Pasang [APK 0.1.8](https://mile.posnew.com/downloads/Mile-Camera-0.1.8.apk) sebagai pembaruan aplikasi lama. Sertifikat dan application ID tetap sama, versionCode 9. Aplikasi 0.1.7 menawarkan update ini melalui pemeriksaan versi yang sudah tersedia.

## Selesai capture

Tekan **Selesai** setelah seluruh foto diambil. Aplikasi menyalin foto ke riwayat dan otomatis membuat PDF di penyimpanan privat aplikasi, tanpa izin storage atau pemilih lokasi. Satu foto menjadi satu halaman, mengikuti urutan dan orientasi foto, tanpa memotong alamat atau mengompresi ulang JPEG. Pembuatan PDF berjalan pada worker setelah capture selesai; jalur shutter tidak menunggu PDF.

Pop-up **PDF tersimpan otomatis** menampilkan jumlah gambar, tanggal, dan nama file. **Proses AI** melanjutkan batch tersebut; **Unduh PDF** membuat salinan di `Download/MileCamera`; **Lihat batch** membuka riwayat. PDF sudah tersimpan meskipun pengguna menutup pop-up. Foto buram tetap wajib diambil ulang sebelum AI; PDF diperbarui setelah foto diganti.

## Riwayat batch di HP

Di beranda, buka **Riwayat batch · Foto & PDF**. Setiap batch mencantumkan tanggal/jam capture, jumlah gambar, serta status tersimpan/dikirim ke hasil. Tombol **Lihat gambar**, **Buka PDF**, **Unduh PDF**, dan **Proses AI** bekerja untuk batch yang dipilih, tanpa mengganti atau menghapus draft batch baru.

Batch yang selesai atau ditinggalkan saat mulai batch baru disimpan lebih dahulu. Riwayat tidak mengikuti masa simpan log server; foto dan PDF tetap tersedia setelah aplikasi dibuka ulang, sampai data aplikasi dihapus atau aplikasi diuninstall. Pembaruan APK biasa mempertahankan data. Batch versi lama yang masih ada di HP dan sudah dikirim ke hasil otomatis dimasukkan ke riwayat; foto yang sudah dihapus oleh versi sebelumnya tidak dapat dipulihkan.

**Buka PDF** memakai aplikasi pembaca PDF di HP dengan izin baca untuk satu file tersebut. **Unduh PDF** memakai MediaStore di Android 10 ke atas tanpa izin storage. Android 8–9 meminta `WRITE_EXTERNAL_STORAGE` hanya saat pengguna menekan Unduh PDF; menolak izin tidak menghapus PDF privat. Tidak ada izin akses seluruh berkas.

## Ketahanan dan build

Salinan gambar, PDF, serta manifest ditulis atomik. Batch aktif baru dikosongkan setelah riwayat dan PDF berhasil disimpan. Gagal menyimpan mempertahankan draft. PDF menggunakan penanda berdasarkan daftar foto agar retake tidak memakai PDF lama; hasil terpotong akibat proses terhenti dibuat ulang. Penulisan PDF streaming membatasi memori pada satu buffer JPEG, termasuk batch 150 gambar.

[Source Android 0.1.8](https://mile.posnew.com/downloads/Mile-Camera-0.1.8-source.zip) tidak memuat SDK, output build, keystore, atau password. Android minimum 8.0. Sertifikat SHA-256: `eb9585f3fe6f601da93b23e5ba9e24b7a4958d23b5edce0e90908424af89e491`. Prosedur build dan tes tersedia di `android/README.md`; metadata rilis dan hash APK ada di `downloads/mile-camera-update.json`.
