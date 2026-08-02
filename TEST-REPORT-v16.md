# Test Report — MILE Secure Gateway v16

Tanggal pengujian: 2026-08-02

## Static validation

- JavaScript syntax check: lulus untuk `_worker.js`, `login-v16.js`, `session-v16.js`, `events-v16.js`, dan `ai-pdf-v16.js`.
- Secret scan: tidak ditemukan pola Google API Key (`AIza...`), private key, service account, atau Cosmos API key.
- Firebase client SDK/config scan: tidak ditemukan `firebaseConfig`, `initializeApp`, atau `signInWithEmailAndPassword`.
- Inline JavaScript handler scan: tidak ditemukan `onclick` atau `onchange` pada `app.html` dan `beta.html`.

## Worker integration tests

- Health endpoint melaporkan v16 dan semua binding.
- Pengunjung tanpa session menerima halaman login saja.
- `app.html` tanpa session diarahkan ke login.
- Asset inti tanpa session menghasilkan 401.
- AI proxy tanpa session menghasilkan 401.
- Login lintas origin ditolak 403.
- Email di luar allowlist ditolak sebelum Firebase dipanggil.
- Password salah menghasilkan pesan generik.
- Login benar menghasilkan cookie `__Host-mile_session` + HttpOnly + Secure + SameSite=Lax.
- Session valid dapat membuka aplikasi dan `/api/auth/me`.
- Cookie yang dimodifikasi ditolak.
- AI proxy dengan session valid meneruskan request ke CosmosHub.
- Logout menghapus cookie.

## Visual tests

- Login desktop: 1440 × 1000 — lulus.
- Login mobile: 412 × 915 — lulus.
- Workspace desktop: 1440 × 1000 — lulus.
- Workspace mobile: 412 × 915 — lulus.

Pengujian visual dilakukan dengan Chromium headless menggunakan HTML dan CSS paket final.

## Browser interaction tests

- Tombol lihat/sembunyikan password: lulus.
- Submit login dengan respons server sukses: lulus pada desktop dan mobile.
- Tidak ada horizontal overflow pada login desktop/mobile: lulus.
- Tidak ada horizontal overflow pada workspace desktop/mobile: lulus.
- Event binder pengganti inline handler: seluruh tombol dan perubahan field terhubung ke fungsi yang benar.
