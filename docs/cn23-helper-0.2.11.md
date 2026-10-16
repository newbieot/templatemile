# Mile CN23 Helper 0.2.11 — 16 Oktober 2026

Nama penerima dibatasi **30 karakter** dan alamat penerima **80 karakter** saat
ekstensi mengisi form Transaksi CN23. Spasi/baris berlebih dirapikan sebelum
pemotongan. Jika kolom Mile memiliki `maxlength` yang lebih pendek, batas kolom
tersebut dipakai. Pemotongan tidak memisahkan pasangan karakter Unicode.

Batas ini merupakan setelan ekstensi yang diminta untuk memperpendek data,
bukan hasil pengukuran batas API Mile. Nama/alamat pendek tetap terisi seperti biasa.

Aturan berlaku otomatis untuk ritel, korporat, Excel baru, serta baris antrean
lama yang belum selesai. Pengirim dan kolom lain memakai perilaku sebelumnya.
Sumber Excel dan data lengkap dalam antrean dipertahankan. Pencocokan wilayah
memakai data tujuan lengkap; kode pos/zona terkunci tetap mengikuti Mile.

Setelah transaksi pertama selesai, baris berikutnya tetap diisi otomatis.
Produk PE, pembayaran Cash/Invoice/CREDIT, berat di atas 1 kg, dan dukungan
Chrome 88 ke atas (32-bit/64-bit) tetap tersedia.

## Memperbarui

1. Jeda antrean, lalu unduh dan ekstrak ZIP 0.2.11 ke folder ekstensi yang lama.
2. Buka `chrome://extensions`, klik **Reload / Muat ulang** pada Mile CN23 Helper.
3. Muat ulang tab Mile. Pastikan panel menampilkan versi **0.2.11**.
4. Buka form CN23 kosong, lalu tekan Start. Baris selesai tidak diulang;
   antrean lama tidak perlu dihapus atau Excel diekspor ulang.

## Pengujian

Uji mencakup batas tepat, teks panjang, spasi/baris, Unicode, `maxlength`
Mile yang lebih pendek, penerima ritel/korporat, serta pengirim yang tetap utuh.
Batch menguji satu Start untuk tiga kiriman, termasuk penerima panjang pada
baris kedua dan kelanjutan otomatis ke baris ketiga, tanpa tab cetak.
Pengujian memakai form lokal dan tidak membuat transaksi Mile produksi.

Unduhan dan panduan: https://mile.posnew.com/unduhan
