# Mile Camera 0.1.5

Foto label → Proses AI → kode pos otomatis → dua Excel terpisah → Upload Excel + Start pada ekstensi CN23.

1. Unduh [APK 0.1.5](https://mile.posnew.com/downloads/Mile-Camera-0.1.5.apk) pada HP lalu pilih **Perbarui** tanpa menghapus aplikasi lama.
2. Batch baru memakai **Campuran**. Capture label lokal dan luar kota dalam satu batch.
3. Foto yang hilang atau hasilnya kosong dibaca ulang secara terpisah hingga dua putaran. Foto asli tidak diturunkan resolusinya. Audit kosong tidak menimpa data awal yang sudah terbaca.
4. Desa/kecamatan dan kode pos dicocokkan dengan database nasional. Field pencarian wilayah sudah dihapus. Kandidat dengan kecamatan, kota, provinsi, dan kode pos sama langsung dipakai pada tingkat kecamatan tanpa mengarang nama desa.
5. **Sungai Guntung Kateman Inhil Riau** langsung mendapat **29255**; **Pulau Kijang Inhil Riau** mendapat **29273**. Kode pos tercetak yang bertentangan atau wilayah yang benar-benar berbeda tetap membutuhkan koreksi alamat.
6. Unduh **Excel Lokal Batam** untuk menu lokal Mile dan **Antrean CN23** untuk ekstensi komputer. Log Kamera menampilkan jumlah Lokal, Luar Kota, dan Tujuan belum pasti.
7. Perbarui [ekstensi 0.2.0](https://mile.posnew.com/downloads/Mile-CN23-Helper-0.2.0.zip), buka form CN23 kosong, klik ikon → **Upload Excel** → **Start**. Pembayaran dan antrean berikutnya otomatis. Resi dicetak manual belakangan.

Jika seluruh percobaan pembacaan suatu foto gagal, tampil pesan khusus dengan nomor foto. Foto asli tetap disimpan. Koneksi AI dan foto yang dapat dibaca masih diperlukan.

APK 0.1.5 menggunakan source capture cepat 0.1.2 yang sudah disesuaikan pada 0.1.4. Perubahan native rilis ini hanya versionCode 6 dan versionName 0.1.5; shutter dan storage tidak diubah. Release dan lint lulus. Sertifikat SHA-256 sama: `eb9585f3fe6f601da93b23e5ba9e24b7a4958d23b5edce0e90908424af89e491`.

Pengujian web mencakup pipeline empat foto dengan dua hasil awal kosong, pembacaan ulang JPEG asli satu per satu, perlindungan hasil awal, pencocokan Kateman, dua workbook campuran, upload workbook pada menu halaman, pembayaran, antrean dua transaksi, acknowledgement resi ulang, dan notifikasi selesai. Form dan kandidat Kateman 29255 diperiksa langsung pada Mile; transaksi produksi dari Chrome dengan ekstensi terpasang belum dijalankan. Pengujian sensor/autofocus fisik mengikuti HP pengguna.

[Source APK](https://mile.posnew.com/downloads/Mile-Camera-0.1.5-source.zip) tidak menyertakan keystore/password/SDK lokal. Minimal Android 8.0. APK 0.1.4 yang sudah terpasang juga menerima pembaruan AI dari web saat halaman review dimuat ulang.
