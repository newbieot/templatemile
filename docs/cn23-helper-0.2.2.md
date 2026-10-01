# Mile CN23 Helper 0.2.2

[Unduh ekstensi](https://mile.posnew.com/downloads/Mile-CN23-Helper-0.2.2.zip). Timpa folder ekstensi lama, klik Reload di chrome://extensions, lalu muat ulang tab Mile pada form kosong. Panel harus tertulis **0.2.2**.

Panel hanya **Upload Excel**, **Start/Jeda**, dan **Reset**. Upload Excel → Start sekali. Cash/Invoice/CREDIT dan Selesai otomatis; setelah resi cocok dan form berikutnya kosong siap, kiriman berikutnya berjalan. Semua selesai menampilkan pesan hijau. Menu unduh hasil dihapus.

Klik **Reset** untuk menghentikan antrean lama dan memilih Excel baru. Panel akan muncul kembali setelah form dibersihkan. ID yang sudah berhasil tidak dikirim ulang jika ikut dalam file baru. ID yang sudah menekan Selesai tetapi hasilnya belum pasti tetap dicatat; kiriman baru bisa diproses, sedangkan ID yang belum pasti menunggu resinya.

Script tidak lagi bergantung pada satu pemberitahuan awal form siap atau injeksi ulang saat URL berubah. Script hidup pada semua rute Mile, memeriksa form kosong setiap detik, membedakan pergantian form di dokumen yang sama, dan menjawab pemeriksaan dari pengelola antrean. Kesiapan sebelum resi terverifikasi tidak memulai transaksi berikutnya. Token antrean lama dibatalkan saat Reset, termasuk pekerjaan yang masih menunggu respons.

Uji integrasi mencakup tiga kiriman dari satu Start, reload penuh, navigasi dalam dokumen yang sama, pesan awal siap yang hilang, pembayaran otomatis, Enter pelanggan, referensi terlambat, dan satu notifikasi selesai. Uji Reset memastikan pekerjaan lama tidak submit/mengganggu pengganti; riwayat sukses dan resi terlambat dipertahankan. Transaksi produksi melalui ekstensi Chrome belum diuji oleh agen.

APK tetap **0.1.6**; perubahan ini hanya pada ekstensi dan publikasi paketnya.
