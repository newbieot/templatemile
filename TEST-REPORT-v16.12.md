# Test Report — mile.posnew.com v16.12

Tanggal pengujian: 15 Agustus 2026  
Versi aplikasi: `20260815-16.12`

## Hasil

| Pemeriksaan | Hasil |
|---|---|
| Sintaks seluruh JavaScript aplikasi | LULUS |
| Sintaks module `_worker.js` | LULUS |
| Profil koneksi default UI adalah `normal` | LULUS |
| Profil koneksi default runtime adalah `normal` | LULUS |
| Default efektif adalah 15 halaman × 5 jalur | LULUS |
| Mode Otomatis tetap tersedia sebagai pilihan manual | LULUS |
| Mode Hemat data tetap tersedia sebagai pilihan manual | LULUS |
| Konfigurasi sesi lama tidak terbawa sebagai default | LULUS |
| Gemini 3.7 Flash tetap menjadi model default | LULUS |
| Seluruh 17 referensi `/assets/` tersedia dan memakai versi `20260815-16.12` | LULUS |
| Bundle lama `ai-pdf-v16-11.js` tidak ada pada paket | LULUS |
| Endpoint health mengembalikan versi `20260815-16.12` dan `no-store` | LULUS |
| Guard ID pelanggan ASTRA dan BSN tetap aktif | LULUS |

## Perubahan perilaku koneksi

- Pemrosesan baru dimulai dengan profil **Normal cepat**.
- Preset Cepat menghasilkan 15 halaman per permintaan dan 5 permintaan paralel tanpa pembatasan otomatis.
- Mode Otomatis tidak lagi menjadi default, tetapi tetap dapat dipilih bila pengguna ingin pembatasan adaptif.
- Mode Hemat data 4 halaman × 1 jalur hanya aktif bila dipilih manual atau ketika pengguna sengaja memilih mode Otomatis pada koneksi yang terdeteksi lambat.
- Storage key baru `mile-ai-config-v16-12` mencegah pilihan Auto/Hemat data dari rilis lama ikut terbawa.

## Verifikasi cache deployment

- `APP_VERSION` dinaikkan menjadi `20260815-16.12`.
- Bundle AI memakai path baru `/assets/js/ai-pdf-v16-12.js`.
- Seluruh CSS, JavaScript, PDF.js, SheetJS, dan PDF worker memakai query `?v=20260815-16.12`.
- HTML dan API tetap `no-store`; aset berversi tetap dapat memakai cache panjang.

## Verifikasi sesudah deployment

1. Buka `https://mile.posnew.com/api/health` dan pastikan `version` bernilai `20260815-16.12`.
2. Login lalu buka **Pengaturan AI untuk PDF**.
3. Pastikan **Normal cepat · 15 halaman × 5 jalur · Default** terpilih.
4. Pastikan **Halaman per permintaan** bernilai 15 dan **Permintaan paralel** bernilai 5.
