# MILE Secure Gateway v16

Versi ini mempertahankan seluruh fungsi MILE v15, lalu menambahkan autentikasi Firebase yang diproses **di Cloudflare Worker**, bukan melalui Firebase SDK di browser.

## Perubahan keamanan utama

- Pengunjung yang belum login hanya menerima `index.html` (halaman login).
- HTML inti aplikasi dipindahkan ke `app.html` dan hanya disajikan setelah session valid.
- Semua asset inti di `/assets/` ditolak sebelum login.
- `/api/ai-proxy` wajib memiliki session valid.
- Firebase Web API Key tidak disimpan di HTML, JavaScript, atau GitHub.
- `COSMOS_API_KEY` tetap berada di Cloudflare Secret.
- Session memakai cookie `__Host-...`, `HttpOnly`, `Secure`, dan `SameSite=Lax`.
- Email yang diizinkan secara default hanya `ikhsan@posnew.com`.
- CSP memblokir inline JavaScript; event lama dipindahkan ke `events-v16.js`.
- Tidak ada registrasi akun publik.

> Catatan penting: pengunjung yang belum login tidak bisa mengambil HTML/JS inti melalui website. Namun repository GitHub yang **public** tetap bisa dibaca siapa pun. Jadikan repository private bila kode sumber juga tidak ingin terlihat dari GitHub. Keamanan endpoint tidak bergantung pada kerahasiaan HTML.

## Secret Cloudflare yang wajib

Buka Cloudflare Pages:

`Workers & Pages → templatemile → Settings → Variables and Secrets → Add`

Tambahkan sebagai **Secret**:

1. `COSMOS_API_KEY`
2. `FIREBASE_WEB_API_KEY`
3. `MILE_SESSION_SECRET`

Opsional sebagai Text atau Secret:

4. `MILE_ALLOWED_EMAILS`

Nilai awal:

```text
ikhsan@posnew.com
```

Beberapa email dapat dipisahkan dengan koma:

```text
ikhsan@posnew.com,user2@example.com
```

### Membuat `MILE_SESSION_SECRET`

Jalankan:

```text
GENERATE-SESSION-SECRET.bat
```

Nilai acak akan dibuat dan disalin ke clipboard. Tempel ke Cloudflare. Jangan simpan nilainya di GitHub.

## Menyiapkan Firebase API Key yang aman

Karena key lama pernah masuk commit GitHub, lakukan rotasi:

1. Google Cloud Console → project `mile-posnew-com`.
2. APIs & Services → Credentials.
3. Buat API key baru.
4. Pada **API restrictions**, pilih `Restrict key`.
5. Izinkan hanya **Identity Toolkit API** (`identitytoolkit.googleapis.com`).
6. Jangan menambahkan Generative Language API/Gemini API.
7. Simpan key baru sebagai `FIREBASE_WEB_API_KEY` di Cloudflare Secret.
8. Hapus/revoke key lama yang terdeteksi GitHub.

Karena request Firebase dikirim dari Cloudflare Worker, jangan memakai HTTP referrer restriction pada key server ini. Nilai key tidak dikirim ke browser.

## Firebase Authentication

Di Firebase Console:

1. Authentication → Sign-in method.
2. Aktifkan Email/Password.
3. Authentication → Users.
4. Pastikan akun `ikhsan@posnew.com` tersedia dan memiliki password.
5. Jangan aktifkan pendaftaran publik pada website.

## Instalasi

1. Ekstrak ZIP ke folder biasa.
2. Jalankan `INSTALL-KE-GITHUB.bat`.
3. Installer menyalin repository penuh ke:

```text
%USERPROFILE%\Documents\GitHub\templatemile
```

4. Jalankan `CHECK-VERSION.bat`.
5. Pastikan seluruh pemeriksaan berstatus `[OK]`.
6. Commit dan Push melalui GitHub Desktop.
7. Tunggu deployment Cloudflare selesai.

## Verifikasi setelah deployment

Buka:

```text
https://mile.posnew.com/api/health
```

Hasil yang benar:

```json
{
  "ok": true,
  "service": "mile-secure-gateway",
  "version": "20260802-16",
  "cosmosConfigured": true,
  "firebaseConfigured": true,
  "sessionConfigured": true,
  "serverSideGate": true
}
```

Uji melalui Incognito:

1. Pengunjung belum login hanya melihat halaman login.
2. `/app.html` mengarah kembali ke login.
3. `/assets/js/app-core.js` tanpa session menghasilkan `401`.
4. Email/password salah ditolak.
5. `ikhsan@posnew.com` berhasil masuk.
6. Proses PDF dan tombol Tes Layanan AI bekerja.
7. Tombol Keluar menghapus session.

## Cloudflare Access

Pertahankan Cloudflare Access selama pengujian awal. Setelah login v16 dan AI dipastikan berfungsi:

1. Zero Trust → Access controls → Applications → MILE Converter.
2. Tambahkan policy `Bypass`.
3. Include: `Everyone`.
4. Uji lagi melalui Incognito.

Setelah Bypass, Firebase Secure Gateway menjadi lapisan login utama. Bila Firebase bermasalah, hapus policy Bypass untuk mengaktifkan kembali Access.

## Session

- Tanpa centang “Tetap masuk”: 12 jam.
- Dengan centang: 7 hari.
- Untuk memutus semua session sekaligus, ganti `MILE_SESSION_SECRET` dan deploy ulang.

## File penting

- `_worker.js` — login server, session, gate asset, dan proxy CosmosHub.
- `index.html` — halaman login publik.
- `app.html` — HTML inti yang hanya disajikan setelah login.
- `assets/js/login-v16.js` — form login tanpa Firebase key.
- `assets/js/session-v16.js` — status akun dan logout.
- `assets/js/events-v16.js` — event handler tanpa inline JavaScript.
- `assets/js/ai-pdf-v16.js` — alur PDF AI berbasis session.
