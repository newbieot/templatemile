# Test Report — mile.posnew.com v16.13

Tanggal pengujian: 15 Agustus 2026  
Versi aplikasi: `20260815-16.13`  
Bundle AI: `assets/js/ai-pdf-v16-13.js`

## Ringkasan

Semua pemeriksaan otomatis dan regresi statis lulus. Default tetap Gemini 3.7 Flash dengan profil Normal cepat, 15 halaman per permintaan, dan 5 jalur paralel. Smart Efficiency mengurangi sumber dan output yang tidak diperlukan, tetapi tetap mengaudit halaman hilang, ganda, atau meragukan secara selektif.

## Hasil pengujian

| Pemeriksaan | Hasil |
|---|---|
| Sintaks `_worker.js` dan seluruh JavaScript aplikasi | LULUS |
| Gemini 3.7 Flash dipilih dan diizinkan pada browser/gateway | LULUS |
| Default efektif Normal cepat, 15 halaman × 5 jalur | LULUS |
| Text layer hanya dipakai bila memiliki teks cukup dan penanda penerima/alamat | LULUS |
| Sumber campuran text layer + gambar menghasilkan payload yang benar | LULUS |
| Halaman bersih tidak diaudit ulang | LULUS |
| Halaman hilang atau `PERLU DICEK` masuk audit selektif | LULUS |
| Audit hanya mengganti halaman yang diperiksa | LULUS |
| Nomor halaman lokal/salah dipetakan kembali ke rentang kelompok | LULUS |
| Batas output dinamis: 15 halaman = 6.900 token | LULUS |
| Respons JSON terpotong diperbaiki tanpa mengirim ulang gambar | LULUS |
| Usage dari respons awal dan perbaikan JSON dijumlahkan benar | LULUS |
| `/api/health` mengembalikan v16.13 dan header `no-store` | LULUS |
| Semua referensi `/assets/` tersedia dan memakai `20260815-16.13` | LULUS |
| Bundle lama `ai-pdf-v16-12.js` tidak ada | LULUS |
| Template ASTRA, BSN Batam, dan JACCS MPM tetap utuh | LULUS |
| Guard ID pelanggan dan validasi luar Kota Batam tetap tersedia | LULUS |

## Dampak efisiensi yang terukur dari konfigurasi

- Batas output pass pertama untuk kelompok 15 halaman turun dari maksimum 17.250 menjadi 6.900 token.
- Kelompok bersih tidak mengirim pass audit kedua; satu halaman meragukan hanya mengirim satu gambar audit, bukan seluruh 15 halaman.
- Pass gambar pertama dibatasi 1.900 px, sedangkan gambar hingga 2.600 px dibuat hanya untuk halaman audit.
- PDF dengan text layer yang valid mengirim teks penerima/alamat secara langsung; halaman scan dan text layer tanpa penanda tujuan tetap memakai gambar.
- Schema tidak lagi meminta `confidence` atau salinan teks penuh. `raw_lines` hanya opsional, maksimal tiga baris, dan hanya untuk bagian meragukan.
- Rate limit 429 memakai jeda lebih aman 8 dan 18 detik sebelum retry berikutnya.

Nilai di atas adalah pengurangan batas/payload berdasarkan jalur program. Pemakaian token aktual tetap bergantung pada isi PDF, jumlah halaman scan, dan jumlah halaman yang perlu diaudit.

## Cache dan deployment

- `APP_VERSION` adalah `20260815-16.13`.
- HTML dan endpoint API memakai `no-store`.
- Semua URL CSS/JavaScript/vendor memakai query `?v=20260815-16.13`.
- Bundle AI memakai path baru `/assets/js/ai-pdf-v16-13.js`, sehingga cache bundle v16.12 tidak dapat dipakai untuk runtime baru.
- Setelah deployment, periksa `/api/health`; bila aturan Cache Rule eksternal pernah mengabaikan query string atau menyimpan HTML, lakukan **Purge Everything** satu kali.

## Verifikasi manual setelah push

1. Buka `https://mile.posnew.com/api/health` dan pastikan `version` bernilai `20260815-16.13`.
2. Login dan pastikan **Gemini 3.7 Flash · Default** terpilih.
3. Pastikan **Normal cepat · 15 halaman × 5 jalur · Default** terpilih.
4. Proses satu PDF text-based dan satu PDF hasil scan; pastikan hasil masuk ke tabel dan halaman meragukan ditandai kuning.
5. Pastikan proses selesai tanpa memuat `ai-pdf-v16-12.js` pada tab Network browser.
