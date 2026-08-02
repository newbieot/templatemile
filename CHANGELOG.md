# Changelog

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
