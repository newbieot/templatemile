# Test Report — mile.posnew.com v16.10

Tanggal pengujian: 13 Agustus 2026  
Versi aplikasi: `20260813-16.10`

## Hasil

| Pemeriksaan | Hasil |
|---|---|
| Sintaks seluruh JavaScript aplikasi | LULUS |
| Sintaks module `_worker.js` | LULUS |
| Template lama `INDTEMPO01294A` tidak ada pada runtime | LULUS |
| Kontrol dan event pertanyaan Bank Syariah lama tidak ada pada runtime | LULUS |
| Template BSN mengunci ID `FINBSN01294A` | LULUS |
| Template BSN mengunci nama `BANK SYARIAH NASIONAL KC BATAM` | LULUS |
| Template BSN mengunci layanan `PKH` | LULUS |
| Template BSN mengunci tarif `915616` | LULUS |
| Template BSN mengunci jenis kiriman `DOKUMEN` | LULUS |
| Seluruh 28 referensi file lokal pada HTML tersedia | LULUS |
| Seluruh referensi `/assets/` pada HTML memakai versi `20260813-16.10` | LULUS |
| HTML/API mengirim cache `no-store` | LULUS |
| Aset berversi mengirim cache `immutable` | LULUS |
| Respons aplikasi mengirim `x-mile-app-version: 20260813-16.10` | LULUS |

## Uji ekspor Excel sebenarnya

Pengujian dijalankan dengan SheetJS lokal yang disertakan dalam aplikasi. Field UI ID pelanggan sengaja dikosongkan dan field nama, layanan, tarif, serta jenis kiriman sengaja diubah sebelum ekspor. Workbook kemudian dibuat menjadi byte XLSX dan dibuka ulang.

Hasil file `Upload_MileApp_FINBSN01294A.xlsx`:

| Kolom Excel | Nilai hasil |
|---|---|
| `customer_code` | `FINBSN01294A` |
| `origin_data_customer_name` | `BANK SYARIAH NASIONAL KC BATAM` |
| `service_code` | `PKH` |
| `connote_sub_service_code` | `915616` |
| `Jenis_Barang` | `DOKUMEN` |

Ukuran workbook uji: 18.122 byte. Seluruh nilai tetap benar meskipun field UI dimanipulasi, karena preset menjadi sumber kebenaran saat ekspor.

## Uji guard worksheet

Pada pengujian kedua, sel `customer_code` sengaja dikosongkan setelah data dikonversi menjadi worksheet. Aplikasi membatalkan penyimpanan file dan menampilkan fatal guard. Dengan demikian, file korporat yang tidak memiliki ID pelanggan tidak dapat lolos sampai tahap unduh.

## Verifikasi sesudah deployment

1. Jalankan `CHECK-VERSION.bat` sebelum commit.
2. Setelah Cloudflare Pages selesai deploy, buka `https://mile.posnew.com/api/health`.
3. Pastikan nilai `version` adalah `20260813-16.10`.
4. Pada respons `/` atau `/app`, pastikan header `x-mile-app-version` juga bernilai `20260813-16.10`.
