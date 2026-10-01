# Mile CN23 Helper 0.2.3

[Unduh ekstensi](https://mile.posnew.com/downloads/Mile-CN23-Helper-0.2.3.zip). Timpa isi folder ekstensi lama, klik Reload di chrome://extensions, lalu muat ulang tab Mile pada form CN23 kosong. Panel harus tertulis **0.2.3**.

Pada 0.2.2, satu ID yang sudah menekan Selesai tetapi resinya belum terbaca menolak seluruh Excel. Sekarang **Reset → Upload Excel yang sama → Start** memproses baris lainnya. Baris yang sudah berhasil dan yang hasilnya belum pasti dilewati secara terpisah. Panel menunjukkan nomor baris dan nama penerima yang belum pasti; kiriman itu tidak dikirim ulang. Jika seluruh baris sudah berhasil atau tertahan, Start tetap tidak aktif dan panel menjelaskan tidak ada kiriman baru.

Resi kiriman tertahan yang datang kemudian tetap dicocokkan dan dicatat tanpa mengganggu kiriman aktif. Notifikasi selesai menyatakan jumlah kiriman yang diproses dan jumlah kiriman dari file yang dilewati karena belum pasti. Cetak resi tetap dilakukan manual di Mile.

Menghapus ekstensi lalu Load unpacked menghapus riwayat lokal kiriman. Untuk pengujian setelah memasang ulang, gunakan Excel yang hanya berisi kiriman yang belum dibuat resinya. Memperbarui folder lama dengan Reload mempertahankan riwayat tersebut.

Pengujian menggunakan form simulasi dan pengelola antrean: upload ulang Excel empat baris setelah Reset, satu kiriman tertahan, Start aktif untuk sisanya, pembayaran Cash/Invoice/CREDIT, dan tiga transaksi berturut-turut. Ekstensi terpasang di Chrome pengguna belum diuji langsung. APK tetap 0.1.6.
