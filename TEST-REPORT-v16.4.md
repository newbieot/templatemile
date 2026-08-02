# Test Report — mile.posnew.com v16.4

Tanggal pengujian: 2 Agustus 2026

## Hasil

- JavaScript syntax `_worker.js`: lulus (`node --check`).
- JavaScript syntax `assets/js/ai-pdf-v16.js`: lulus (`node --check`).
- Worker health check: versi `20260802-16.4` dan `metricsConfigured: true` pada environment uji.
- `/api/metrics/ai` tanpa session: lulus, menghasilkan HTTP 401.
- `/api/metrics/ai` dengan origin lintas situs: lulus, menghasilkan HTTP 403.
- `/api/metrics/ai` dengan session HMAC valid: lulus.
- Email pengguna pada payload Google Sheets diambil dari session server: lulus.
- Webhook secret ditambahkan oleh server dan tidak berasal dari browser: lulus.
- Payload durasi, jumlah baris, halaman, model, chunk, concurrency, perlu dicek, dan luar Batam: lulus.
- Helper stopwatch: `00:00.0` dan `01:02.5`: lulus.
- Perhitungan durasi presisi dan jumlah data perlu dicek/luar Batam: lulus.
- HTML: tidak ada ID duplikat.
- Seluruh asset lokal yang dirujuk `app.html`: tersedia.
- CSS: kurung kurawal seimbang pada seluruh stylesheet.
- Scan pola Google API key dan private key: tidak ditemukan secret tertanam.
- Validasi alamat luar Kota Batam v16.3 tetap tersedia.
- Secure Gateway, allowlist, dan proteksi `/api/ai-proxy` tetap tersedia.

## Perilaku v16.4

1. Stopwatch mulai ketika pemrosesan PDF dimulai.
2. Durasi meliputi pembacaan PDF, rendering halaman, request AI, verifikasi, penggabungan, dan persiapan tabel.
3. Setelah selesai, aplikasi menampilkan total durasi, jumlah data, detik per data, dan jumlah halaman.
4. Satu event metrik dikirim ke endpoint server `/api/metrics/ai`.
5. Endpoint server menambahkan email session, versi aplikasi, dan webhook secret.
6. Google Sheets hanya menerima statistik, bukan nama, alamat, telepon, atau isi PDF.
7. Kegagalan pencatatan Google Sheets tidak membatalkan hasil ekstraksi AI; status pencatatan ditampilkan jelas.

## Batas pengujian

Pengujian endpoint dilakukan dengan mock respons Google Apps Script. Pengujian end-to-end terhadap spreadsheet milik pengguna harus dilakukan setelah deployment Cloudflare Pages karena URL dan secret produksi tidak dibuka ke lingkungan pengujian ini.
