# Test Report — mile.posnew.com v16.7

## Ruang lingkup

Penambahan template PT JACCS MPM Finance Indonesia pada basis v16.6.

## Hasil yang diverifikasi

- Opsi template JACCS MPM tersedia di workspace utama dan beta.
- Saat template dipilih, ID pelanggan menjadi `FINMPMJKT04120A`.
- Nama pelanggan menjadi `PT JACCS MPM FINANCE INDONESIA`.
- Sub Service Code menjadi `868523` dan read-only.
- Layanan default menjadi `PKH`.
- Pengguna tetap dapat memilih `PE`.
- Ekspor menegakkan kembali `customer_code` dan `connote_sub_service_code` sesuai template.
- Ekspor menegakkan `origin_data_customer_name` secara persis, tanpa digantikan isi kolom pengirim dari dokumen.
- `service_code` mengikuti dropdown aktif: `PKH` atau `PE`.
- Sintaks JavaScript seluruh asset lulus pemeriksaan Node.js.
- ZIP dapat diekstrak ulang dan struktur file lengkap.

## Uji perilaku ekspor yang dijalankan

`app-core.js` dijalankan pada Node.js VM dengan DOM dan SheetJS yang dimock. Input tersembunyi sengaja diubah menjadi nilai salah sebelum ekspor untuk memastikan aturan template tidak bergantung pada input browser.

Hasil:

- Ekspor dengan layanan PKH menghasilkan `customer_code=FINMPMJKT04120A`, `origin_data_customer_name=PT JACCS MPM FINANCE INDONESIA`, `connote_sub_service_code=868523`, `service_code=PKH`.
- Ekspor dengan layanan PE menghasilkan tiga nilai identitas yang sama dan `service_code=PE`.
- Nama pengirim yang berasal dari PDF tidak menimpa `origin_data_customer_name` JACCS MPM.
