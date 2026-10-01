# Mile CN23 Helper 0.2.4

[Unduh ekstensi](https://mile.posnew.com/downloads/Mile-CN23-Helper-0.2.4.zip). Timpa folder ekstensi lama, klik Reload di chrome://extensions, lalu muat ulang tab Mile pada form kosong. Panel harus tertulis **0.2.4**. Riwayat kiriman tetap tersimpan bila ekstensi diperbarui tanpa uninstall.

Setelah Selesai, Mile berpindah ke daftar transaksi dan membuka tab resi. Versi sebelumnya langsung memaksa tab daftar transaksi membuka form baru melalui reload penuh, saat resi masih ditunggu. Reload tersebut dapat menghentikan callback pembuka halaman cetak dalam dokumen asal. Versi ini menunggu bukti dari tab resi sebelum memindahkan tab utama. Sesudah bukti cocok, tab utama otomatis membuka form CN23 dan memproses kiriman berikutnya.

Panel tampil kembali setelah reload tanpa perlu menekan ikon ekstensi. Jika Vue mengganti isi halaman, panel ditempelkan kembali. Nomor antrean, nama penerima, status menunggu resi, dan kolom yang belum siap tetap terlihat. Membuka daftar transaksi untuk memeriksa hasil tidak lagi dibalas dengan reload berulang selama resi masih ditunggu.

Pembaca resi tetap mengirim hasil otomatis. Pengelola antrean juga meminta pembacaan ulang dari tab cetak yang terbuka ketika halaman selesai dimuat dan saat panel memperbarui status. Pemeriksaan ID resi baru, tab asal, nama pengirim/penerima, wilayah/kode pos, serta referensi tetap berlaku. Ini bukan pengiriman ulang transaksi.

Pengujian mencakup callback cetak yang belum berjalan saat rute daftar transaksi muncul; callback harus tetap hidup hingga resi terbuka. Tiga kiriman diuji dari satu Start melalui reload penuh dan navigasi Vue. Pengujian terpisah mencakup pemulihan panel, pesan resi yang terlewat, dan struktur Label Mile yang diamati pada transaksi contoh pengguna. Tidak ada submit produksi melalui ekstensi Chrome yang dilakukan oleh agen.

Reset dan upload ulang Excel tetap melewati ID yang sudah berhasil atau yang hasilnya belum pasti. Gunakan Excel kiriman yang belum dibuat resinya jika ekstensi pernah dihapus dan dipasang ulang. APK tetap 0.1.6.
