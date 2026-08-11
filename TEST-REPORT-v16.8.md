# TEST REPORT v16.8

## Fokus regresi: ID Pelanggan korporat

- ASTRA DAIHATSU MOTOR BATAM harus selalu menghasilkan `customer_code=INDASTRADAI01294A`.
- Seluruh template preset harus memiliki ID Pelanggan non-kosong di konfigurasi.
- Ekspor korporat harus dibatalkan jika `customer_code` kosong.
- Ekspor preset harus dibatalkan jika `customer_code` hasil berbeda dari konfigurasi template.

## Template INDTEMPO01294A

- ID Pelanggan selalu `INDTEMPO01294A`.
- Nama Pengirim wajib diisi sebelum ekspor.
- Pengguna wajib memilih Ya/Tidak untuk tarif Bank Syariah Negara Cabang Batam.
- Jika Ya: `connote_sub_service_code=915552`, `service_code=PKH`, `Jenis_Barang=DOKUMEN`.
- Jika Tidak: tarif/layanan dapat diisi/dipilih sesuai kebutuhan lain, tetapi ID Pelanggan tetap `INDTEMPO01294A`.

## Pemeriksaan teknis

- `node --check assets/js/app-core.js`: wajib lulus.
- `node --check assets/js/events-v16.js`: wajib lulus.
- Audit statis seluruh opsi template terhadap konfigurasi: wajib lulus.

## Hasil uji yang dijalankan

- **LULUS** — 11 template preset diuji dengan field `customerId` UI sengaja dikosongkan setelah pemilihan template; seluruh output tetap memakai ID Pelanggan yang benar.
- **LULUS** — ASTRA tetap menghasilkan `INDASTRADAI01294A` dan nama file `Upload_MileApp_INDASTRADAI01294A.xlsx`.
- **LULUS** — INDTEMPO tarif khusus menghasilkan `INDTEMPO01294A`, tarif `915552`, layanan `PKH`, dan `DOKUMEN`.
- **LULUS** — Nama Pengirim kosong pada INDTEMPO memblokir ekspor.
- **LULUS** — JACCS tetap dapat diubah dari default PKH ke PE tanpa mengubah `customer_code` dan sub service `868523`.
- **LULUS** — perpindahan INDTEMPO tarif khusus ke mode Ritel menyembunyikan opsi khusus dan membuka kembali kontrol layanan/jenis kiriman.
- **LULUS** — pemeriksaan sintaks seluruh JavaScript dengan `node --check`.
- **LULUS** — audit statis memastikan seluruh opsi Template Pelanggan di `app.html` memiliki konfigurasi ID Pelanggan yang cocok.
