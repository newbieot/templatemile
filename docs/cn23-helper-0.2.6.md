# Mile CN23 Helper 0.2.6

[Unduhan & Panduan](https://mile.posnew.com/unduhan) menyediakan APK Mile Camera 0.1.6, ZIP ekstensi 0.2.6, petunjuk instalasi dan penggunaan. Tombol untuk membukanya tersedia pada halaman login, app, beta, camera, dan review. Panduan dibuka di tab terpisah agar halaman kerja tetap terbuka.

Ekstensi mengikuti kode pos dan kode zona yang dikunci Mile setelah wilayah tujuan cocok. Selisih dengan Excel tidak menghentikan antrean, untuk seluruh kode pos dan zona. Bila beberapa kandidat wilayah memiliki satu kode pos Mile yang sama, kandidat pertama dapat dipilih meskipun kode itu berbeda dari Excel. Nama kota/kecamatan/kelurahan tetap digunakan untuk mencocokkan wilayah.

Untuk memperbarui, timpa file pada folder ekstensi lama, klik Reload di chrome://extensions, lalu muat ulang tab Mile. Antrean 0.2.5 tetap tersimpan. Jika pengisian sempat gagal karena perbedaan kode pos, tekan Start untuk mencoba kembali baris gagal dan melanjutkan baris berikutnya. Baris yang sudah selesai tidak diulang. Jangan memakai Reset bila ingin mempertahankan kemajuan; Reset mengosongkan seluruh antrean.

Uji form mencakup beberapa pasangan kode pos dan zona yang berbeda untuk ritel serta korporat. Uji gabungan tiga kiriman membuat kode pos dan zona pada data kedua berbeda dari Excel, lalu memastikan data ketiga tetap diisi dan diselesaikan dari satu Start. Reload penuh, navigasi dalam dokumen yang sama, pesan kesiapan terlewat, dan tidak adanya tab cetak tetap tercakup. Uji terpisah memastikan kemajuan 0.2.5 dapat dilanjutkan hanya pada baris gagal.

Pengujian memakai simulasi DOM/service worker; submit produksi dengan ekstensi Chrome terpasang belum dilakukan oleh agen. APK tidak berubah pada rilis ini.
