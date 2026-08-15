# Changelog

## v16.13 — Smart Efficiency tanpa mengurangi default kecepatan

- Mempertahankan Gemini 3.7 Flash serta default **15 halaman × 5 jalur** pada profil Normal cepat.
- Mengutamakan text layer PDF yang lolos validasi dan memakai gambar 1900 px untuk pass pertama.
- Mengaudit ulang hanya halaman hilang, ganda, atau meragukan menggunakan gambar hingga 2600 px, lalu menggabungkan hasil per halaman agar baris bersih tidak berubah.
- Meringkas schema JSON, membatasi `raw_lines` pada bagian meragukan, serta menyesuaikan batas output token berdasarkan jumlah halaman.
- Memperbaiki JSON terpotong melalui permintaan teks ringan sebelum retry penuh dan memperpanjang jeda khusus rate limit 429.
- Mengganti bundle AI menjadi `ai-pdf-v16-13.js` dan identitas aset menjadi `20260815-16.13` untuk memutus cache lama.

## v16.12 — Default 15 halaman × 5 jalur

- Menjadikan profil koneksi **Normal cepat** sebagai default sehingga proses memakai preset 15 halaman × 5 jalur tanpa otomatis turun ke mode hemat data.
- Mempertahankan mode Otomatis dan Hemat data sebagai pilihan manual untuk kondisi koneksi yang benar-benar lambat.
- Mengganti storage key menjadi `mile-ai-config-v16-12` dan membersihkan konfigurasi lama agar default Auto/Hemat data tidak terbawa dari sesi sebelumnya.
- Mengganti bundle AI menjadi `ai-pdf-v16-12.js` dan identitas aset menjadi `20260815-16.12` agar rilis baru langsung dimuat setelah deployment.

## v16.11 — Gemini 3.7 Flash dan identitas cache baru

- Menambahkan `gemini-3.7-flash` pada allowlist browser dan Cloudflare Worker.
- Menjadikan Gemini 3.7 Flash sebagai model default untuk pemrosesan PDF.
- Mempertahankan Gemini 3.6 Flash sebagai pilihan fallback.
- Mengganti bundle AI menjadi `ai-pdf-v16-11.js`, serta mengganti versi aplikasi dan seluruh URL aset menjadi `20260815-16.11` agar browser dan Cloudflare mengambil berkas rilis baru setelah deployment.

## v16.10 — Template FINBSN dan cache deployment

- Mengganti template `INDTEMPO01294A` menjadi `FINBSN01294A` untuk Bank Syariah Nasional KC Batam.
- Mengunci nama pelanggan `BANK SYARIAH NASIONAL KC BATAM`, layanan `PKH`, tarif `915616`, dan jenis kiriman `DOKUMEN` dari konfigurasi preset sampai tahap ekspor.
- Menghapus pertanyaan khusus Bank Syariah Negara Cabang Batam beserta seluruh event dan logika tarif lamanya.
- Memvalidasi `customer_code` pada setiap baris dan setiap sel worksheet sebelum file Excel disimpan; ekspor dibatalkan bila ID kosong atau berubah.
- Mengubah HTML dan API menjadi `no-store`, memakai URL aset versi `20260813-16.10`, serta memberi cache panjang `immutable` hanya pada aset yang memiliki identitas versi.
- Menambahkan header `x-mile-app-version` untuk memeriksa versi yang sedang disajikan Cloudflare Pages.

## v16.9 — Koneksi lambat, progres aktual, dan pemulihan otomatis

- Menambahkan profil koneksi Auto, Internet tidak stabil, dan Internet stabil.
- Auto memakai batas konservatif bila browser tidak dapat membaca kualitas jaringan; mode hemat data membatasi 4 halaman × 1 jalur.
- Menambahkan progres pembacaan file lokal dan progres unggah aktual berbasis byte untuk setiap kelompok halaman.
- Menampilkan jumlah halaman siap, kelompok selesai, status koneksi, aktivitas terakhir, serta durasi nyata ketika AI masih bekerja.
- Menunggu internet kembali saat offline, retry otomatis hingga tiga kali, deteksi unggahan macet 45 detik, timeout browser 6 menit, dan timeout upstream gateway 5 menit.
- Menambahkan jeda render agar main thread sempat memperbarui tampilan dan tab tidak terlihat freeze.
- Mencegah timer penutup dari PDF sebelumnya menyembunyikan modal progres PDF berikutnya pada antrean multi-file.
- Memindahkan PDF.js dan SheetJS menjadi aset lokal yang dapat dicache privat oleh browser.
- Mempertahankan seluruh validasi template pelanggan dan guard ekspor dari v16.8.

## v16.8 — Proteksi ID Pelanggan & template INDTEMPO

- Memperbaiki bug ASTRA DAIHATSU MOTOR BATAM: `customer_code` sekarang selalu `INDASTRADAI01294A` saat ekspor.
- Semua template pelanggan preset kini memakai satu konfigurasi sebagai sumber `customer_code`; nilai tidak lagi bergantung pada input UI tersembunyi.
- Menambahkan fatal guard: ekspor korporat dibatalkan jika ada `customer_code` kosong atau tidak sesuai preset.
- Menambahkan template `INDTEMPO01294A`; Nama Pengirim wajib diisi.
- Menambahkan pilihan tarif khusus Bank Syariah Negara Cabang Batam: jika Ya, `connote_sub_service_code=915552`, `service_code=PKH`, dan `Jenis_Barang=DOKUMEN`.

## v16.7 — Template PT JACCS MPM Finance Indonesia

- Menambahkan template pelanggan `PT JACCS MPM FINANCE INDONESIA`.
- `customer_code` selalu `FINMPMJKT04120A`.
- `origin_data_customer_name` selalu `PT JACCS MPM FINANCE INDONESIA`.
- `connote_sub_service_code` selalu `868523`.
- `service_code` default `PKH`, tetapi mengikuti pilihan pengguna menjadi `PE` jika layanan PE dipilih.
- Nilai wajib JACCS MPM ditegakkan kembali saat ekspor agar tidak kosong atau tertimpa data sumber.

## v16.7 — Default 15 halaman, opsi 20 halaman

- Mempertahankan 5 jalur paralel sebagai default.
- Mengubah preset Cepat dari 10 menjadi 15 halaman per permintaan.
- Mempertahankan opsi 10 halaman sebagai pilihan stabil untuk dokumen sulit.
- Menambahkan opsi 20 halaman untuk dokumen bersih atau pengujian eksperimental.
- Menaikkan batas halaman per permintaan di JavaScript menjadi 20.
- Mengganti storage key agar konfigurasi 10 halaman dari v16.5 tidak terbawa.
- Mempertahankan stopwatch, statistik Google Sheets, autentikasi, validasi luar Batam, dan seluruh fitur v16.5.

## v16.5 — Lima jalur sebagai default

- Menghapus pilihan 6 jalur dan preset Turbo.
- Menetapkan 5 jalur paralel sebagai default baru.
- Preset Cepat sekarang memakai 10 halaman per permintaan, 5 jalur, dan audit adaptif.
- Membatasi nilai concurrency maksimum menjadi 5 di JavaScript, termasuk untuk konfigurasi sesi lama.
- Mengganti storage key agar konfigurasi 6 jalur dari versi sebelumnya tidak terbawa.

## v16.5 — Stopwatch dan statistik Google Sheets

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
