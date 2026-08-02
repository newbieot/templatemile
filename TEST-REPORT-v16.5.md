# Test Report — mile.posnew.com v16.5

Tanggal pengujian: 2 Agustus 2026

## Ruang lingkup perubahan

- Menghapus pilihan **6 jalur** dari pengaturan permintaan paralel.
- Menghapus preset **Turbo** dari antarmuka dan JavaScript.
- Menetapkan **5 jalur** sebagai default baru.
- Mempertahankan audit adaptif pada preset Cepat.
- Mencegah konfigurasi 6 jalur versi lama terbawa ke versi baru.

## Pengujian yang dijalankan

- `node --check` untuk `_worker.js` dan seluruh file `assets/js/*.js`: lulus.
- Versi Worker dan asset diperbarui menjadi `20260802-16.5`: lulus.
- Elemen `aiConcurrency` tidak memiliki opsi 6 jalur: lulus.
- Elemen `aiConcurrency` menetapkan opsi 5 sebagai `selected`: lulus.
- Preset Turbo tidak ditemukan pada `app.html` dan `assets/js/ai-pdf-v16.js`: lulus.
- Preset Cepat memakai `pagesPerRequest: 10`, `concurrency: 5`, dan `verification: 'smart'`: lulus.
- Nilai concurrency pada JavaScript dibatasi maksimum 5: lulus.
- Storage key baru `mile-ai-config-v16-5` digunakan: lulus.
- Storage konfigurasi lama `mile-ai-config-v16` dihapus saat startup: lulus.
- Tidak ada ID HTML duplikat pada `app.html`: lulus.
- Semua asset lokal yang dirujuk `app.html` tersedia: lulus.
- Marker Secure Gateway, Firebase server-side auth, proteksi AI proxy, validasi luar Batam, stopwatch, dan endpoint metrik tetap tersedia: lulus.
- Scan pola Google API key dan private key pada source aplikasi: tidak ditemukan secret tertanam.

## Perilaku akhir

- Saat halaman pertama kali dibuka, pilihan default adalah **10 halaman per permintaan × 5 jalur paralel**.
- Jalur 4 tetap tersedia sebagai pilihan lebih konservatif.
- Jalur 1–3 tetap tersedia untuk provider yang sedang membatasi request atau untuk scan sulit.
- Jalur 6 tidak dapat dipilih dari antarmuka dan tidak dapat dipakai melalui konfigurasi aplikasi karena nilai maksimum dijepit menjadi 5.
- Audit adaptif tetap berjalan pada default 5 jalur.

## Catatan batas pengujian

Patch ini hanya mengubah pengaturan paralel dan versi aplikasi. Integrasi Google Sheets tidak diubah. Pengujian koneksi produksi Google Apps Script tetap harus dilanjutkan terpisah karena endpoint produksi sebelumnya masih mengembalikan HTTP 502.
