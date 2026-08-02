# Changelog

## v16.4 — Stopwatch dan statistik Google Sheets

- Menambahkan stopwatch live selama PDF dirender, dikirim ke AI, diverifikasi, dan dimasukkan ke tabel.
- Menampilkan total durasi, jumlah data, detik per data, dan jumlah halaman setelah proses.
- Menambahkan endpoint session-protected `/api/metrics/ai`.
- Mencatat statistik sukses, gagal, dan dibatalkan ke Google Sheets melalui Apps Script.
- Email pengguna diambil dari session server, bukan input browser.
- Log tidak memuat nama, alamat, nomor telepon, atau isi dokumen pelanggan.
- Health check menampilkan `metricsConfigured` tanpa membuka URL atau secret.


## v16.3 — Validasi wajib alamat luar Kota Batam

- AI dan verifikasi kedua menilai alamat penerima luar Kota Batam secara eksplisit.
- Kode pos 294xx dan nama wilayah Batam mencegah salah tandai alamat lokal.
- Alamat luar Batam memiliki alur keputusan terpisah dari teks “PERLU DICEK”.
- Ekspor dikunci sampai pengguna memilih: hapus baris, atau nyatakan AI salah deteksi dan lanjutkan.
- Pesan, badge, ringkasan, warna, dan status dibedakan agar tidak membingungkan.
- Tombol aksi tabel dinamis memakai event listener, bukan inline handler.

## v16.2 — Branding dan terminologi

- Nama aplikasi pada antarmuka diubah menjadi `mile.posnew.com`.
- Sistem Pos Indonesia yang menjadi tujuan upload disebut `Mile App`.
- Metadata, manifest, halaman login, workspace, halaman 404, dan OG cover diseragamkan.
- Nama teknis `MILE_SESSION_SECRET`, `MILE_ALLOWED_EMAILS`, cookie `__Host-mile_session`, dan identifier internal dipertahankan agar deployment lama tetap kompatibel.
- Hotfix redirect Cloudflare Pages dari v16.1 tetap dipertahankan.

## v16.1 — Cloudflare Pages redirect hotfix

- Memperbaiki loop `/` ↔ `/index.html` pada Pages Assets.
- Menyajikan login dari route asset `/` dan aplikasi dari `/app`.
- Menandai `/app` dan `/beta` sebagai route terlindungi.
- Health version menjadi `20260802-16.1`.

## v16 — Secure Gateway

- Membangun ulang autentikasi dari basis v15 yang stabil.
- Menghapus Firebase SDK dan `firebaseConfig` dari browser.
- Firebase email/password diproses melalui Cloudflare Pages Function (`_worker.js`).
- Memindahkan aplikasi inti dari `index.html` ke `app.html`.
- Menolak HTML/JS/CSS inti bagi pengguna tanpa session.
- Menambahkan cookie session HMAC bertanda tangan, HttpOnly, Secure, dan SameSite=Lax.
- Menambahkan allowlist email dengan default `ikhsan@posnew.com`.
- Melindungi `/api/ai-proxy` dengan session.
- Menghapus file Firebase client lama yang memicu GitHub Secret Scanning.
- Menghapus seluruh Firebase API key dari repository.
- Menambahkan CSP, anti-frame, no-store, origin check, dan pesan error generik.
- Mempertahankan default Gemini 3.6 Flash serta fungsi PDF v15.
