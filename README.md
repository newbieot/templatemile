# mile.posnew.com Secure Gateway v16.42

Versi ini mempertahankan seluruh fungsi aplikasi persiapan data untuk Mile App pada v15, lalu menambahkan autentikasi Firebase yang diproses **di Cloudflare Pages Function (`_worker.js`)**, bukan melalui Firebase SDK di browser.

## Mobile camera station di `/camera`

Halaman `/camera` dirancang untuk Chrome Android dan memakai kamera belakang HP secara langsung. Tidak diperlukan DroidCam, webcam PC, atau aplikasi Android tambahan. HP dipasang pada holder tetap; operator hanya mengganti sampul/label dan menekan **Capture** berulang kali.

Menekan **Open Camera** sekaligus membuka preview fullscreen dan membuat sesi capture; tidak ada lagi langkah Start Capture Session. Setiap kali Capture ditekan, browser memutar suara shutter sintetis instan (Web Audio API), animasi kilat putih layar (visual flash), getaran haptic ponsel, dan notifikasi HUD mengambang langsung di layar bidik kamera (`✓ Capture X tersimpan`). Di mode fullscreen, operator dapat langsung menekan tombol **Finish Capture** tanpa harus keluar layar penuh terlebih dahulu. Hasil capture tersimpan dengan nomor urut, timestamp, capture ID, dan sesi yang terjaga.

Browser tetap menjalankan auto crop ringan. Jika confidence deteksi rendah, crop beralih ke area panduan tetap dan foto tetap dimasukkan ke batch. Resolusi, blur, dan brightness hanya disimpan sebagai metadata internal, tidak lagi memblokir capture; operator menentukan kelayakan dari preview dan dapat menghapus foto bila perlu.

Saat **Finish Capturing** ditekan, blob JPEG hasil crop disimpan langsung ke IndexedDB dan dibuka di `/review` tanpa dibuat atau dibaca ulang sebagai PDF. JPEG kemudian dikirim sebagai gambar base64 melalui Secure Gateway tanpa R2. Foto dikelompokkan menjadi lima gambar per permintaan dengan hingga tiga permintaan paralel; urutan hasil tetap digabung berdasarkan nomor halaman. JPEG asli dipakai selama ukuran kelompok aman; penyesuaian ukuran adaptif hanya dilakukan bila diperlukan agar payload tetap di bawah batas gateway. Model default kamera adalah `deepseek-v4.1-flash`, lalu fallback berurutan ke `gemini-3.8-flash` dan `gemini-3.1-pro`. Pilihan model eksperimen di halaman Camera telah dihapus dan kamera tidak memakai GLM.

Gateway membatasi respons lengkap setiap request kamera Gemini sampai 20 detik dan DeepSeek sampai 35 detik. Browser memberi batas 30 detik untuk Gemini dan 45 detik untuk DeepSeek agar gateway sempat menjalankan fallback. HTTP 5xx termasuk 520, timeout, serta jawaban kosong atau tidak valid memicu fallback; setiap model dicoba sekali per kelompok, tanpa request perbaikan JSON tambahan. Model yang gagal dilewati pada kelompok berikutnya dalam batch yang sama. HTTP 429 atau 520 menurunkan sisa proses menjadi satu jalur.

Audit otomatis kamera hanya mengirim ulang foto yang tidak menghasilkan data, nama/alamat yang hilang atau bertanda **PERLU DICEK**, atau skor keyakinan AI untuk keterbacaan nama/alamat di bawah **0,65**. Skor ini merupakan penilaian model atas bacaannya, bukan jaminan ketepatan. Keraguan ringan, nomor HP/referensi opsional, format nama, klasifikasi wilayah, dan beberapa baris per foto tetap ditandai untuk pemeriksaan operator tanpa audit AI tambahan. Kelompok audit berjalan maksimal dua jalur; setiap foto yang terpilih diaudit sekali dan hasil audit tetap diperiksa pengguna.

Batch sementara disimpan di IndexedDB pada perangkat dan dihapus setelah seluruh pemrosesan berhasil. Bila sebagian ekstraksi atau audit gagal, hasil yang berhasil tetap masuk tabel, foto tanpa hasil mendapat baris **PERLU DICEK**, dan foto asli tetap tersimpan untuk dicoba ulang. Audit memakai model yang berhasil pada ekstraksi pertama; kegagalan audit mempertahankan hasil awal untuk pemeriksaan operator. Route `/camera` tetap memerlukan session Firebase yang valid dan permission camera hanya diizinkan pada halaman ini. Pipeline `/beta` tetap terpisah dan masih dapat memakai R2; sesi `/camera` tidak memakai upload, referensi, maupun cleanup R2.

Panel **Log Kamera** di desktop menampilkan ID batch/perangkat, waktu capture dan proses AI, model serta skema paralel, statistik foto/hasil/bersih/perlu dicek/luar Batam, template dan konfigurasi layanan, kecepatan per data, waktu simpan, serta masa kedaluwarsa. Log baru menyimpan ringkasan ini bersama hasil batch; log lama tetap ditampilkan menggunakan metadata yang masih tersedia.

Halaman utama memakai Gemini 3.8 Flash dengan `reasoning_effort: medium` serta profil 15 halaman × 3 jalur. Structured output JSON dipakai bila didukung CosmosHub dan otomatis diulang tanpa schema sekali bila gateway menolaknya. Jika gateway secara eksplisit menolak parameter reasoning, request diulang satu kali memakai default model agar batch tidak gagal; kejadian ini dicatat pada log kelompok. DeepSeek R2 tetap memakai profil 15 halaman × 5 jalur.

## Eksperimen PC lawas di `/beta`

Halaman `/beta` memakai `deepseek-v4.1-flash` sebagai model default. PDF dirender sebagai JPEG 1150 px dengan kualitas 72% dan maksimal dua pekerjaan render bersamaan agar perangkat tetap responsif. Setiap gambar diunggah ke R2 `mile-beta-ai-images`, lalu URL sementara dikirim ke DeepSeek dalam kelompok 15 halaman × 5 jalur. Mode DeepSeek tidak kembali ke base64 bila unggahan R2 gagal. Preset Turbo melewati audit kedua untuk mengutamakan target waktu; preset Sedang tetap tersedia bila dokumen sulit membutuhkan audit penuh.

Pilihan `deepseek-v4.1-flash` pada Beta adalah default eksperimental. Gambar halaman ringan diunggah ke R2 dan URL bertanda tangan yang berlaku satu jam dikirim langsung ke model. R2 mengurangi payload permintaan, tetapi tidak merender PDF; render gambar tetap dilakukan maksimal dua halaman bersamaan di browser. Gemini 3.8 tetap dapat dipilih manual dan memakai fallback Gemini 3.7 lalu Gemini 3.6 bila provider terganggu.

Binding Cloudflare Pages yang diperlukan:

```text
BETA_AI_IMAGES -> mile-beta-ai-images
```

Pada mode Hemat data, gambar memakai referensi bertanda tangan yang hanya dapat ditukar menjadi base64 oleh Worker untuk pemilik sesi yang sama. Referensi kedaluwarsa setelah satu jam, gambar dihapus saat pekerjaan selesai, dan lifecycle R2 satu hari tetap menjadi pembersihan cadangan.


## Penamaan aplikasi

- Nama aplikasi sementara: **mile.posnew.com**.
- Sistem Pos Indonesia yang menjadi tujuan upload disebut **Mile App**.
- Nama teknis lama seperti `MILE_SESSION_SECRET`, `MILE_ALLOWED_EMAILS`, dan cookie `__Host-mile_session` tetap dipertahankan agar konfigurasi Cloudflare yang sudah berjalan tidak rusak.

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
4. `GOOGLE_SHEETS_WEBHOOK_SECRET`

Tambahkan sebagai **Plaintext**:

5. `MILE_ALLOWED_EMAILS`
6. `GOOGLE_SHEETS_WEBHOOK_URL`

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

Karena request Firebase dikirim dari Cloudflare Pages Function (`_worker.js`), jangan memakai HTTP referrer restriction pada key server ini. Nilai key tidak dikirim ke browser.

## Firebase Authentication

Di Firebase Console:

1. Authentication → Sign-in method.
2. Aktifkan Email/Password.
3. Authentication → Users.
4. Pastikan akun `ikhsan@posnew.com` tersedia dan memiliki password.
5. Jangan aktifkan pendaftaran publik pada website.


## Statistik pemrosesan AI dan Google Sheets

Versi v16.19 menampilkan progres rinci dan stopwatch selama PDF diproses, lalu menyimpan satu baris statistik untuk setiap PDF melalui endpoint terlindungi `/api/metrics/ai`.

Data yang dicatat: waktu server, email pengguna dari session, versi aplikasi, status, jumlah file, jumlah halaman, model AI, ukuran chunk, concurrency, durasi detik, jumlah data, detik per data, jumlah data perlu dicek, jumlah alamat luar Kota Batam, dan kategori error. Nama penerima, alamat, nomor telepon, serta isi PDF tidak dikirim ke Google Sheets.

Cloudflare Pages variables:

```text
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
GOOGLE_SHEETS_WEBHOOK_SECRET=<nilai acak yang sama dengan MILE_METRICS_SECRET di Apps Script>
```

Setelah mengubah variables/secrets, lakukan deployment ulang. Health check harus menampilkan `metricsConfigured: true`.

Panduan lengkap ada di `GOOGLE-SHEETS-SETUP.md`.

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
  "service": "mile-posnew-secure-gateway",
  "version": "20260926-16.41-camera-fullscreen",
  "cosmosConfigured": true,
  "firebaseConfigured": true,
  "sessionConfigured": true,
  "metricsConfigured": true,
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

Pertahankan Cloudflare Access selama pengujian awal. Setelah login v16.19 dan AI dipastikan berfungsi:

1. Zero Trust → Access controls → Applications → mile.posnew.com.
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
- `assets/js/ai-pdf-beta-r2.js` — runtime aktif untuk PDF dan Camera Direct. Seluruh keluarga Gemini memakai reasoning medium; halaman utama menjalankan Gemini 3.8 Flash dengan 15 halaman × 3 jalur. Beta DeepSeek R2 tetap dapat memakai 15 halaman × 5 jalur. Jika Gemini terganggu, proses otomatis memakai Gemini 3.7 Flash lalu Gemini 3.6 Flash.


## Pembaruan v16.19

- Nomor surat resmi setelah label **NOMOR**, **NOMOR SURAT**, **NO. SURAT**, atau **REF** diprioritaskan untuk kolom **REF/SURAT**.
- Spasi OCR di sekitar titik, garis miring, dan tanda hubung pada nomor resmi dirapikan. Contoh `3166 /PAN.01.W32-U2/HK2. 4/VII/2026` menjadi `3166/PAN.01.W32-U2/HK2.4/VII/2026`.
- Bila nomor resmi tidak ditemukan, AI memakai isi setelah label **PERIHAL**, **HAL**, atau **SUBJECT** tanpa menyimpan kata labelnya.
- Token kode/resi panjang yang mencampur angka dan huruf dihapus dari Nama Penerima oleh AI dan diperiksa ulang secara lokal. Contoh: `FAHRUDIN 0028C20250400784` menjadi `FAHRUDIN`.
- Bundle AI memakai path baru `ai-pdf-v16-19.js`; seluruh URL aset memakai identitas `20260819-16.19` agar Cloudflare dan browser tidak memakai cache rilis lama.

### Mencegah versi lama setelah push GitHub

1. Jalankan `CHECK-VERSION.bat`, lalu commit dan push seluruh file yang berubah bersama-sama.
2. Tunggu deployment Cloudflare Pages berstatus **Success**, kemudian buka `/api/health` dan pastikan versi `20260819-16.19`.
3. Uji satu PDF yang memuat perihal serta nama dengan kode alfanumerik.
4. Bila domain masih menyajikan HTML lama, lakukan **Caching → Configuration → Purge Everything** satu kali setelah deployment.


## Pembaruan v16.18

- Seluruh **nilai data** string dibersihkan lagi tepat sebelum Excel dibuat. Karakter yang diperbolehkan hanya huruf, angka, spasi, serta `. / - ( )`.
- Karakter lain seperti koma, garis bawah, titik dua, ampersand, tanda kutip, simbol formula, dan emoji diubah menjadi spasi lalu spasi berlebih dirapikan.
- Setelah konversi ke worksheet, setiap sel data diperiksa ulang. Ekspor dibatalkan bila ada karakter terlarang yang lolos.
- Header template Mile App tetap memakai nama schema aslinya (termasuk underscore) agar file tetap dapat diimpor; aturan karakter ketat berlaku pada isi/nilai sel data.
- Perlindungan identik diterapkan pada aplikasi utama dan halaman beta.
- Bundle AI memakai nama baru `ai-pdf-v16-18.js`; seluruh URL aset memakai identitas `20260819-16.18` agar browser dan Cloudflare mengambil rilis baru.

### Mencegah versi lama setelah push GitHub

1. Jalankan `CHECK-VERSION.bat`, lalu commit dan push seluruh file yang berubah bersama-sama.
2. Tunggu deployment Cloudflare Pages berstatus **Success**, kemudian buka `/api/health` dan pastikan versi `20260819-16.18`.
3. Pastikan Cache Rule Cloudflare tidak mengabaikan query string untuk `/assets/*`; bundle AI memakai path baru agar tidak tertukar dengan rilis sebelumnya.
4. Bila domain masih menyajikan HTML dari aturan cache lama, lakukan **Caching → Configuration → Purge Everything** satu kali setelah deployment.


## Pembaruan v16.16

- Khusus template **Pengadilan Negeri Batam**, `origin_data_customer_name` pada setiap baris Excel sekarang selalu berasal dari nilai **REF/SURAT** baris tersebut.
- Ekspor PN Batam dibatalkan bila ada REF/SURAT kosong agar Nama Pengirim tidak pernah kosong atau salah memakai nama template.
- Template lainnya tetap memakai Nama Pengirim dari template atau pengaturan awal.
- Kolom Pengirim tetap tidak ditampilkan pada Periksa hasil; REF/SURAT tetap dapat diedit dan dapat diisi massal.
- Bundle AI memakai nama baru `ai-pdf-v16-16.js`; seluruh URL aset memakai identitas `20260816-16.16` agar browser dan Cloudflare mengambil rilis baru.

### Mencegah versi lama setelah push GitHub

1. Jalankan `CHECK-VERSION.bat`, lalu commit dan push seluruh file yang berubah bersama-sama.
2. Tunggu deployment Cloudflare Pages berstatus **Success**, kemudian buka `/api/health` dan pastikan versi `20260816-16.16`.
3. Pastikan Cache Rule Cloudflare tidak mengabaikan query string untuk `/assets/*`; bundle AI memakai path baru agar tidak tertukar dengan rilis sebelumnya.
4. Bila domain masih menyajikan HTML dari aturan cache lama, lakukan **Caching → Configuration → Purge Everything** satu kali setelah deployment.


## Pembaruan v16.15

- Menghapus kolom **Pengirim** dari Periksa hasil. Nama pengirim hasil ekspor selalu berasal dari template atau isian pengaturan awal.
- Menghapus pilihan pengirim pengganti dari pemetaan spreadsheet agar data sumber tidak dapat menimpa pengaturan awal.
- Memperkuat deteksi **PERLU DICEK** tanpa batas kata. Bentuk yang menempel pada angka/huruf, misalnya `1070PERLU DICEK47`, maupun `PERLUDICEK` tetap ditandai sebagai koreksi wajib.
- Ekspor dikunci berdasarkan status data internal, bukan hanya atribut tampilan. Setiap koreksi wajib harus diubah, tidak boleh kosong, tidak boleh masih memuat penanda, dan harus dikonfirmasi selesai.
- Alamat yang dideteksi di luar Kota Batam tidak dapat disetujui tanpa perubahan. Pengguna wajib memperbaiki alamat hingga memiliki bukti wilayah Batam/kode pos 294xx, atau menghapus baris jika tujuan memang di luar Batam.
- Bundle AI memakai nama baru `ai-pdf-v16-15.js`; seluruh URL aset memakai identitas `20260816-16.15` agar browser dan Cloudflare mengambil rilis baru.

### Mencegah versi lama setelah push GitHub

1. Jalankan `CHECK-VERSION.bat`, lalu commit dan push seluruh file yang berubah bersama-sama.
2. Tunggu deployment Cloudflare Pages berstatus **Success**, kemudian buka `/api/health` dan pastikan versi `20260816-16.15`.
3. Pastikan Cache Rule Cloudflare tidak mengabaikan query string untuk `/assets/*`; bundle AI memakai path baru agar tidak tertukar dengan rilis sebelumnya.
4. Bila domain masih menyajikan HTML dari aturan cache lama, lakukan **Caching → Configuration → Purge Everything** satu kali setelah deployment.


## Pembaruan v16.14

- Semua halaman PDF langsung diperlakukan sebagai **scan CamScanner**. Runtime tidak lagi membaca text layer PDF (`getTextContent`), sehingga halaman tidak menjalani ekstraksi teks lokal yang sia-sia.
- Pass pertama tetap merender gambar maksimal 1900 px. Hanya halaman hilang, ganda, atau meragukan yang diaudit ulang hingga 2600 px agar akurasi tetap terjaga tanpa merender ulang seluruh dokumen.
- Default tetap **15 halaman per permintaan × 5 jalur paralel** dengan Gemini 3.7 Flash.
- Pada tabel **Periksa hasil**, kolom **Alamat** sekarang tepat di sebelah kanan **Nama Penerima**, lalu diikuti Nomor HP.
- **Kode Pos** tidak lagi ditampilkan untuk diedit. Nilainya ditentukan otomatis dengan dua tingkat: angka 5 digit yang terbaca pada alamat, lalu pemetaan kelurahan/kecamatan/kota bila angka tidak tersedia.
- Untuk jenis kiriman **Dokumen**, kolom **Berat** dan **PxLxT** disembunyikan dari Periksa hasil. Ekspor tetap mengisi nilai baku dokumen 0,2 kg dan 10 × 10 × 10 cm.
- Bundle AI memakai nama baru `ai-pdf-v16-14.js`; seluruh URL aset memakai identitas `20260816-16.14` agar browser dan Cloudflare mengambil rilis baru.

### Mencegah versi lama setelah push GitHub

1. Jalankan `CHECK-VERSION.bat`, lalu commit dan push seluruh file yang berubah bersama-sama.
2. Tunggu deployment Cloudflare Pages berstatus **Success**, kemudian buka `/api/health` dan pastikan versi `20260816-16.14`.
3. Pastikan Cache Rule Cloudflare tidak mengabaikan query string untuk `/assets/*`; bundle AI juga memakai path baru agar tidak tertukar dengan rilis sebelumnya.
4. Bila domain masih menyajikan HTML dari aturan cache lama, lakukan **Caching → Configuration → Purge Everything** satu kali setelah deployment.


## Pembaruan v16.13

- Default tetap **15 halaman per permintaan × 5 jalur paralel** dengan profil **Normal cepat**; mode hemat data tidak menjadi default.
- Text layer PDF asli dipakai pada halaman yang lolos validasi penerima/alamat. Halaman scan atau text layer yang meragukan tetap memakai pembacaan gambar.
- Pass pertama memakai gambar maksimal 1900 px. Hanya halaman hilang, ganda, atau meragukan yang diaudit ulang dengan gambar hingga 2600 px.
- JSON hasil dibuat lebih ringkas: `confidence` dan salinan teks penuh tidak diminta; `raw_lines` hanya boleh muncul maksimal tiga baris pada halaman yang meragukan.
- Batas output token menyesuaikan jumlah halaman. Respons JSON terpotong dicoba diperbaiki tanpa mengirim ulang seluruh gambar sebelum melakukan retry penuh.
- Jeda rate limit 429 dibuat lebih aman, sementara hasil audit hanya mengganti halaman yang memang diaudit.
- Bundle AI memakai nama baru `ai-pdf-v16-13.js`; seluruh URL aset memakai versi `20260815-16.13` agar browser dan Cloudflare mengambil rilis baru.

### Mencegah versi lama setelah push GitHub

1. Jalankan `CHECK-VERSION.bat`, lalu commit dan push seluruh file yang berubah bersama-sama.
2. Tunggu deployment Cloudflare Pages berstatus **Success**, kemudian buka `/api/health` dan pastikan versi `20260815-16.13`.
3. Pastikan Cache Rule Cloudflare tidak mengabaikan query string untuk `/assets/*`; bundle AI juga memakai path baru agar tidak tertukar dengan rilis sebelumnya.
4. Bila domain masih menyajikan HTML dari aturan cache lama, lakukan **Caching → Configuration → Purge Everything** satu kali setelah deployment.


## Pembaruan v16.12

- Profil koneksi default sekarang **Normal cepat**, bukan Auto/Hemat data.
- Konfigurasi efektif default adalah **15 halaman per permintaan × 5 jalur paralel**.
- Mode Otomatis dan Hemat data tetap tersedia, tetapi hanya aktif bila dipilih manual.
- Konfigurasi sesi lama dibersihkan agar mode Auto/Hemat data yang pernah tersimpan tidak menimpa default baru.
- Bundle AI memakai nama baru `ai-pdf-v16-12.js` dan seluruh URL aset memakai versi `20260815-16.12` untuk memutus cache lama.

### Mencegah versi lama setelah push GitHub

1. Jalankan `CHECK-VERSION.bat`, lalu commit dan push seluruh file yang berubah bersama-sama.
2. Tunggu deployment Cloudflare Pages berstatus **Success**, kemudian buka `/api/health` dan pastikan versi `20260815-16.12`.
3. Pastikan Cache Rule Cloudflare tidak mengabaikan query string untuk `/assets/*`; bundle AI juga memakai path baru agar tidak tertukar dengan rilis sebelumnya.
4. Bila domain masih menyajikan HTML dari aturan cache lama, lakukan **Caching → Configuration → Purge Everything** satu kali setelah deployment.

## Pembaruan v16.11

- Gemini 3.7 Flash (`gemini-3.7-flash`) menjadi model default untuk pemrosesan PDF.
- Gemini 3.7 Flash telah ditambahkan ke allowlist browser dan Cloudflare Worker agar permintaan tidak ditolak gateway.
- Gemini 3.6 Flash tetap tersedia pada pemilih model sebagai fallback.
- Bundle AI memakai nama baru `ai-pdf-v16-11.js`; versi runtime, indikator UI, PDF worker, dan seluruh URL aset juga dinaikkan ke `20260815-16.11` untuk memutus cache rilis lama.
- HTML dan API tetap memakai `no-store`, sedangkan aset memakai cache panjang hanya melalui URL beridentitas versi.

### Mencegah versi lama setelah push GitHub

1. Jalankan `CHECK-VERSION.bat`, lalu commit dan push seluruh file yang berubah bersama-sama.
2. Tunggu deployment Cloudflare Pages berstatus **Success**, kemudian buka `/api/health` dan pastikan versi `20260815-16.11`.
3. Pastikan Cache Rule Cloudflare tidak mengabaikan query string untuk `/assets/*`; penanda `?v=20260815-16.11` adalah identitas aset rilis ini.
4. Bila domain masih menyajikan HTML dari aturan cache lama, lakukan **Caching → Configuration → Purge Everything** satu kali setelah deployment.

## Pembaruan v16.10

- Mengganti template lama `INDTEMPO01294A` dengan **Bank Syariah Nasional KC Batam · `FINBSN01294A`**.
- Template baru selalu memakai nama pelanggan `BANK SYARIAH NASIONAL KC BATAM`, layanan `PKH`, tarif `915616`, dan jenis kiriman `DOKUMEN`.
- Menghapus pertanyaan “Apakah kiriman Bank Syariah Negara Cabang Batam?”.
- Menambahkan validasi berlapis pada data baris dan worksheet sehingga ekspor dibatalkan bila `customer_code` kosong atau tidak persis `FINBSN01294A`.
- HTML dan API memakai `no-store`; aset statis memakai URL versi `20260813-16.10` dan cache `immutable`. Setiap rilis wajib mengganti versi URL aset agar browser langsung mengambil berkas baru setelah deploy.
- Respons aplikasi mengirim header `x-mile-app-version`, sehingga versi aktif dapat diperiksa melalui Developer Tools atau `curl`.

### Mencegah versi lama setelah push GitHub

1. Jalankan `CHECK-VERSION.bat`, lalu commit dan push seluruh file yang berubah bersama-sama.
2. Tunggu deployment Cloudflare Pages berstatus **Success**, kemudian buka `/api/health` dan pastikan versi `20260813-16.10`.
3. Jangan membuat Cache Rule yang mengabaikan query string untuk `/assets/*`; penanda `?v=20260813-16.10` adalah identitas aset rilis ini.
4. Jika domain masih pernah menerima cache HTML dari aturan lama, lakukan **Caching → Configuration → Purge Everything** satu kali setelah deployment v16.10.

## Pembaruan v16.9

- Menambahkan profil koneksi **Otomatis**, **Internet tidak stabil**, dan **Internet stabil**.
- Profil Auto membatasi ukuran kelompok dan jumlah jalur ketika kualitas jaringan buruk atau tidak dapat diukur, sehingga browser tidak lagi mencoba merender hingga 75 halaman sekaligus.
- Menampilkan progres pembacaan PDF, halaman siap, kelompok selesai, ukuran dan persentase unggah aktual, status online/offline, serta durasi tunggu respons AI.
- Menunggu koneksi kembali ketika browser offline, melakukan retry otomatis, menghentikan unggahan yang benar-benar macet setelah 45 detik, dan memberi batas maksimum respons AI 6 menit di browser / 5 menit di gateway.
- Memberi jeda render antarpages agar browser sempat menggambar UI dan tidak tampak freeze.
- Menyimpan PDF.js dan SheetJS sebagai aset lokal versi tetap; halaman tidak lagi bergantung pada CDN untuk menjalankan pembaca PDF/Excel.
- Aset aplikasi memakai cache browser privat selama satu hari dengan `stale-while-revalidate`, sedangkan HTML dan API tetap `no-store`.

## Pembaruan v16.8

- Customer code untuk seluruh template preset dikunci dari konfigurasi saat ekspor; field UI tersembunyi tidak lagi menjadi sumber ID Pelanggan.
- ASTRA DAIHATSU MOTOR BATAM selalu mengekspor `customer_code=INDASTRADAI01294A`.
- Template baru `INDTEMPO01294A`: Nama Pengirim wajib diisi. Untuk kiriman Bank Syariah Negara Cabang Batam, pilihan khusus mengunci tarif `915552`, layanan `PKH`, dan jenis `DOKUMEN`.
- Ekspor korporat dibatalkan apabila `customer_code` kosong atau berbeda dari ID template.


- Preset Cepat sekarang memakai **15 halaman per permintaan × 5 jalur paralel**.
- Pilihan **10 halaman** tetap tersedia untuk dokumen sulit atau berukuran besar.
- Pilihan **20 halaman** ditambahkan untuk dokumen bersih sebagai mode eksperimental.
- Batas validasi JavaScript untuk halaman per permintaan dinaikkan dari 10 menjadi 20.
- Storage key diganti agar konfigurasi 10 halaman dari v16.5 tidak menimpa default baru.


- Proses AI memeriksa apakah alamat penerima jelas berada di luar Kota Batam.
- Kode pos `294xx` dan nama wilayah/kawasan Batam diperlakukan sebagai bukti alamat lokal agar AI tidak mudah salah menandai.
- Peringatan **Alamat luar Kota Batam** dipisahkan sepenuhnya dari **Teks perlu dicek**.
- Alamat luar Kota Batam tidak dapat langsung diekspor. Pengguna wajib memilih salah satu:
  1. **Hapus baris**, bila alamat memang di luar Kota Batam; atau
  2. **AI salah deteksi — tetap lanjutkan**, bila alamat telah dipastikan masih berada di Kota Batam.
- Ringkasan, warna, status, badge, dan pesan ekspor dibedakan agar kedua jenis masalah tidak membingungkan.
- Tombol tindakan pada tabel memakai event listener dan tidak bergantung pada inline JavaScript.

## Template PT JACCS MPM Finance Indonesia

Pilih **PT JACCS MPM Finance Indonesia · FINMPMJKT04120A** pada Template pelanggan. Hasil workbook selalu memakai:

- `customer_code`: `FINMPMJKT04120A`
- `origin_data_customer_name`: `PT JACCS MPM FINANCE INDONESIA`
- `connote_sub_service_code`: `868523`
- `service_code`: default `PKH`, atau `PE` apabila pengguna memilih layanan PE

Nilai identitas pelanggan dan sub service ditetapkan ulang pada saat ekspor agar tidak kosong atau berubah oleh data sumber.
