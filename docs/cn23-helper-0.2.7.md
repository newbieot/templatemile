# Mile CN23 Helper 0.2.7

Pesan hijau selesai tampil selama 5 detik sejak waktu antrean selesai. Tombol × menutup pesan langsung. Reload halaman atau pesan penyelesaian ulang tidak memperpanjang batas waktu tampil. Penutupan tidak menghapus Excel, hasil kemajuan, atau mengulangi kiriman selesai. Status selesai tetap tersedia pada panel.

Antrean 0.2.5/0.2.6 dipertahankan. Timpa file di folder ekstensi lama, Reload di chrome://extensions, lalu muat ulang tab Mile. Tidak perlu Reset untuk pembaruan ini.

PE diuji dalam simulasi form dan service worker melalui satu Start untuk tiga kiriman: Cash ritel, Invoice korporat, lalu CREDIT korporat. Setiap kiriman diperiksa saat Selesai: kode layanan PE, penerima, referensi, pembayaran, serta pengirim korporat. Form kedua dan ketiga dimuat sebagai dokumen baru; tidak ada tab cetak dalam pengujian. Pilihan produk lain dengan awalan PE tidak ikut dipilih.

Uji bukan transaksi produksi. Pemeriksaan dropdown PE nyata belum dilakukan karena sesi in-app browser kembali ke login. Kode layanan tetap berasal dari service_code Excel.

Unduh dan petunjuk: https://mile.posnew.com/unduhan
