# TEST REPORT v16.9

## Fokus pengujian

- Pengguna langsung melihat modal ketika validasi berkas dan health check dimulai.
- Mode Auto memilih profil hemat data bila kualitas jaringan tidak tersedia atau terdeteksi lambat.
- Mode Internet tidak stabil membatasi proses menjadi maksimal 4 halaman × 1 jalur.
- UI mendapat kesempatan render di antara setiap halaman agar tab tidak terlihat freeze.
- Progres unggah dihitung dari byte aktual melalui `XMLHttpRequest.upload.onprogress`.
- Setelah upload 100%, indikator berubah menjadi status menunggu AI dengan durasi yang terus berjalan.
- Kondisi offline ditampilkan dan proses menunggu koneksi kembali sebelum retry.
- Unggahan tanpa pergerakan selama 45 detik dihentikan dan dicoba ulang; request browser dibatasi 6 menit dan upstream gateway 5 menit.
- PDF.js dan SheetJS dimuat dari aset lokal yang dapat dicache privat.

## Hasil uji otomatis

- **LULUS** — sintaks seluruh JavaScript aplikasi, tiga bundle vendor, dan `_worker.js`.
- **LULUS** — 116 ID pada `app.html` diperiksa dan tidak ada ID duplikat.
- **LULUS** — simulasi profil jaringan: Auto tanpa Network Information API → Hemat data; koneksi 3G lambat → Hemat data; koneksi 4G cepat → Normal cepat; pilihan manual tetap dihormati.
- **LULUS** — simulasi XHR menghasilkan urutan fase `encoding → ready → uploading → waiting → complete`.
- **LULUS** — timer penutup progres lama dibatalkan saat PDF berikutnya mulai, sehingga antrean multi-file tidak kehilangan modal progres.
- **LULUS** — SheetJS 0.18.5 melakukan round-trip workbook XLSX dan mempertahankan nilai `customer_code`.
- **LULUS** — PDF.js 3.11.174 dapat dimuat dan menyediakan fungsi `getDocument`.
- **LULUS** — seluruh referensi aset inti pada `app.html` menunjuk file lokal yang tersedia; tidak ada script eksternal/CDN.
- **LULUS** — guard v16.8 tetap tersedia: ASTRA, INDTEMPO, JACCS MPM, tarif 915552, sub-service 868523, dan fatal guard ID Pelanggan.

## Verifikasi deployment yang disarankan

1. Jalankan `CHECK-VERSION.bat` sebelum commit.
2. Setelah deploy, buka `/api/health` dan pastikan versi `20260812-16.9` serta seluruh konfigurasi bernilai aktif.
3. Uji satu PDF kecil dengan profil Auto, lalu satu PDF lebih besar dengan throttling jaringan browser pada mode Slow 3G.
4. Saat upload berjalan, pastikan ukuran byte dan persen bergerak; setelah 100%, pastikan status berubah menjadi “AI masih bekerja”.
5. Putuskan koneksi beberapa detik, sambungkan kembali, dan pastikan retry berjalan tanpa memuat ulang tab.
