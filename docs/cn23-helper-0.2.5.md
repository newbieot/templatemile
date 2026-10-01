# Mile CN23 Helper 0.2.5

[Unduh ekstensi](https://mile.posnew.com/downloads/Mile-CN23-Helper-0.2.5.zip). Timpa folder ekstensi lama, klik Reload di chrome://extensions, lalu muat ulang tab Mile pada form CN23 kosong. Panel harus tertulis **0.2.5**. Cache Excel dan catatan versi sebelumnya otomatis dihapus pada pembaruan ini.

Klik Upload Excel, pilih Antrean CN23, lalu klik Start sekali. Pengisian, Enter Kode Pelanggan korporat, pemuatan pengirim, hitung PDRI, pemilihan Cash/Invoice/CREDIT, dan Selesai tetap otomatis. Setelah Mile masuk ke daftar transaksi, ekstensi menyimpan kemajuan, membuka form CN23 pada tab utama, menunggu seluruh kolom siap dan kosong, lalu mengisi kiriman berikutnya. Form baru yang sudah terload juga dapat memulihkan antrean jika kejadian navigasi ke daftar transaksi terlewat.

Pemeriksaan tab cetak dihapus seluruhnya, termasuk script pembacanya, akses ke apiexpos, dan pesan menunggu kepastian. Tidak ada unduhan hasil atau pencatatan dari tab cetak. Hasil kiriman dan pencetakan dapat dikelola sendiri melalui Daftar Transaksi Mile.

Panel dipulihkan setelah reload atau penggantian isi halaman. Klik Reset untuk menghentikan proses, menghapus seluruh data antrean tersimpan, dan mengosongkan pilihan file. Setelah Reset, Excel yang sama atau Excel baru dapat di-upload; semua baris file menjadi antrean baru. Tidak ada daftar ID lama yang menahan baris setelah Reset.

Pengujian gabungan menjalankan script form dan pengelola antrean untuk tiga kiriman dari satu Start tanpa tab cetak. Skenario mencakup reload penuh, navigasi dalam dokumen yang sama, pesan kesiapan awal terlewat, serta form kedua telah terload tanpa laporan daftar transaksi. Saat tiap tombol Selesai ditekan, uji memeriksa nama penerima, referensi, metode pembayaran Cash/Invoice/CREDIT, pengirim korporat, dan status submit yang telah tersimpan. Jumlah submit harus tiga, dengan satu pemberitahuan selesai. Kolom ref_no yang terlambat dimuat dan salinan tersembunyi dari form lama juga diuji.

Uji terpisah mencakup pembersihan cache versi lama, Reset dan upload ulang file yang sama, panel setelah navigasi, pesan lama dari versi sebelumnya, dan urutan form yang tidak boleh tertukar. Pengujian memakai simulasi DOM/service worker; submit produksi dengan ekstensi Chrome terpasang belum dilakukan oleh agen. APK tetap 0.1.6.
