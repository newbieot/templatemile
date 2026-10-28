# Mile CN23 Helper 0.2.12 — 28 Oktober 2026

Belakang Padang dapat diimpor ke Antrean CN23 meskipun kota administratifnya
tertulis BATAM atau KOTA BATAM. Versi 0.2.11 masih menolak seluruh kota Batam
sebelum memeriksa kecamatan. Pengecualian sekarang memakai kecamatan tujuan
Belakang Padang atau kode pos Belakang Padang 29491–29496, sesuai kebijakan web.
Data kecamatan tetap berlaku bila kode pos pada Excel berbeda, misalnya
Belakang Padang 29416 atau Kasu 29413. Data tujuan tidak ditulis ulang.

Galang tetap lokal Batam meskipun zona referensinya 29664. Batam lainnya tetap
ditolak dari CN23. Nama jalan/kompleks Belakang Padang saja tidak melewati
validasi ketika kecamatan tujuan sebenarnya wilayah lokal Batam.

Kode pos dan kode zona terkunci mengikuti hasil pilihan wilayah Mile.
Pembayaran ritel/korporat, batas nama 30/alamat 80 karakter, dan kemajuan
antrean tetap memakai perilaku sebelumnya. Tidak ada perubahan format Excel.

## Memperbarui

1. Saat antrean berhenti, ekstrak ZIP 0.2.12 ke folder ekstensi lama dan timpa file.
2. Di `chrome://extensions`, tekan Reload/Muat ulang pada Mile CN23 Helper.
3. Muat ulang tab Mile. Pastikan panel menampilkan **0.2.12**.
4. Upload kembali Excel Belakang Padang yang sebelumnya ditolak, lalu Start.
   File tersebut tidak perlu diekspor ulang. Untuk antrean yang sudah tersimpan,
   cukup lanjutkan Start; jangan Reset bila ingin mempertahankan kemajuan.

## Validasi

Regresi mencakup validasi kota/kecamatan/kode pos, upload Excel pada panel,
impor korporat hingga worker mengisi antrean, serta pengisian tujuan Belakang
Padang/Kasu pada form uji dengan kode terkunci dari Mile. Galang, Batu Aji,
Sekupang, dan tujuan Batam umum tetap ditolak. Pengujian tidak membuat
transaksi produksi. Paket mendukung Chrome 88 ke atas, 32-bit dan 64-bit.

Unduhan terbaru: https://mile.posnew.com/unduhan
