# Changelog

## v16 Secure Gateway — 2026-08-02

- Membangun ulang autentikasi dari basis v15 yang stabil.
- Menghapus Firebase SDK dan `firebaseConfig` dari browser.
- Firebase email/password diproses melalui Cloudflare Worker REST gateway.
- Memindahkan aplikasi inti dari `index.html` ke `app.html`.
- Menolak HTML/JS/CSS inti bagi pengguna tanpa session.
- Menambahkan cookie session HMAC bertanda tangan, HttpOnly, Secure, SameSite=Lax.
- Menambahkan allowlist email dengan default `ikhsan@posnew.com`.
- Melindungi `/api/ai-proxy` dengan session.
- Menghapus file `firebase-auth-v16.js` lama yang memicu GitHub Secret Scanning.
- Menghapus seluruh Firebase API key dari repository.
- Menambahkan CSP, anti-frame, no-store, origin check, dan pesan error generik.
- Menghapus inline JavaScript dan memindahkan event ke `events-v16.js`.
- Membuat UI login desktop dan mobile yang terpisah serta responsif.
- Mempertahankan default Gemini 3.6 Flash dan fungsi PDF v15.
- Menambahkan installer, generator session secret, pemeriksaan versi, dan dokumentasi pemulihan.
