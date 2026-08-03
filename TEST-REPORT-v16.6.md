# Test Report — mile.posnew.com v16.7

Tanggal pengujian: 3 Agustus 2026

## Ruang lingkup perubahan

- Basis sumber: repository v16.5 yang diunggah pengguna.
- Preset Cepat diubah menjadi **15 halaman per permintaan × 5 jalur paralel**.
- Opsi **10 halaman** dipertahankan.
- Opsi **20 halaman** ditambahkan.
- Seluruh fitur autentikasi, stopwatch, Google Sheets metrics, validasi luar Kota Batam, dan Cloudflare Pages Secure Gateway dipertahankan.

## Pemeriksaan otomatis

- Versi Worker dan asset konsisten `20260803-16.7`: lulus.
- `app.html` memiliki opsi halaman 10, 15, dan 20: lulus.
- Hanya opsi 15 yang ditandai `selected`: lulus.
- Opsi 5 jalur tetap `selected`: lulus.
- Preset Cepat JavaScript menggunakan `pagesPerRequest: 15` dan `concurrency: 5`: lulus.
- Batas halaman JavaScript menjadi 20: lulus.
- Batas concurrency tetap 5: lulus.
- Storage key menjadi `mile-ai-config-v16-6` dan key v16.5 dibersihkan: lulus.
- Sintaks seluruh JavaScript dan Worker: lulus.
- Simulasi konfigurasi JavaScript dengan DOM/sessionStorage tiruan menghasilkan default 15 halaman, 5 jalur, preset Cepat, dan hint yang sesuai: lulus.
- Unit test Worker: `/api/health` versi 16.6, `/api/ai-proxy` tanpa session = 401, route `/` menyajikan asset login tanpa loop, dan `/app` tanpa session = 302 ke `/`: lulus.
- Seluruh asset lokal yang dirujuk HTML tersedia: lulus.
- Tidak ditemukan pola private key, service account JSON, Cosmos API key, atau Firebase Web API key di repository: lulus.
- ZIP hasil akhir berhasil diekstrak ulang dan diperiksa: lulus.

## Uji tampilan

- Struktur DOM login dan workspace diparsing tanpa error: lulus.
- Referensi CSS, JavaScript, ikon, dan manifest lokal seluruhnya ditemukan: lulus.
- Dropdown halaman menampilkan 10, 15, dan 20; nilai awal 15: lulus.
- Dropdown paralel menampilkan maksimum 5; nilai awal 5: lulus.
- Pengujian visual produksi tetap dilakukan setelah deployment Cloudflare Pages karena autentikasi dan asset gateway bergantung pada environment produksi.

## Catatan produksi

Uji penuh terhadap CosmosHub, Firebase, Cloudflare Pages Secrets, dan Google Apps Script memerlukan deployment pada akun produksi. Opsi 20 halaman bersifat eksperimental; ukuran gambar PDF dapat menyebabkan HTTP 413 pada dokumen tertentu. Pengguna dapat turun ke 15 atau 10 halaman tanpa mengubah jalur paralel.
