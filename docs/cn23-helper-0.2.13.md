# Mile CN23 Helper 0.2.13 — 28 Oktober 2026

Saat upload Excel dan saat menekan Start, antrean yang memiliki kiriman korporat
menampilkan pertanyaan **Ikuti data pengirim di Excel?** dengan tiga pilihan:

- **Ikuti Excel**: setelah Kode Pelanggan dan Enter selesai memuat data pelanggan
  Mile, ekstensi menghapus nama, nomor telepon, dan alamat pengirim bawaan lalu
  mengisinya dari Excel. Nilai diperiksa kembali sebelum hitung PDRI dan submit.
- **Ikuti Mile**: ketiga kolom pengirim korporat tetap memakai hasil lookup
  pelanggan Mile. Kolom kiriman lain tetap mengikuti antrean.
- **Batal**: upload/Start dibatalkan tanpa mengubah antrean atau memulai kiriman.

Pilihan disimpan per antrean dan terlihat di panel. Start dapat mengganti sumber
untuk kiriman yang belum diproses. Tidak ada pertanyaan tambahan pada tiap baris;
Jeda juga tidak menampilkan pertanyaan. Untuk ritel, data pengirim selalu dari
Excel karena tidak ada lookup pelanggan korporat.

Data pengirim asli pada impor baru tetap disimpan utuh. Hasil lookup Mile dicatat
terpisah sehingga tidak mengubah sumber Excel saat mencoba ulang atau mengganti
pilihan. Format workbook tidak berubah. Belakang Padang tetap CN23 dan Galang
tetap lokal Batam sesuai versi 0.2.12.

## Memperbarui

1. Saat antrean berhenti, ekstrak ZIP 0.2.13 menimpa folder ekstensi lama.
2. Buka `chrome://extensions`, tekan Reload/Muat ulang, lalu refresh tab Mile.
3. Pastikan panel **0.2.13**, upload Excel, dan pilih sumber pengirim.
4. Tekan Start dan pilih sumber yang ingin dipakai untuk proses tersebut.

Validasi memakai form lokal, panel upload, dan worker antrean. Pengujian meliputi
kedua sumber, tiga kolom pengirim, input/change, lookup terlambat, pembatalan,
pilihan saat Start, serta tiga kiriman lintas navigasi dan API Chrome 88/109.
Pengujian tidak membuat transaksi Mile produksi.

Unduhan: https://mile.posnew.com/unduhan
