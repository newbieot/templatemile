# Patch otomatis PE/PKH — Pengadilan Negeri Batam

Patch ini ditujukan untuk repository `newbieot/templatemile`.

## Perilaku baru

Saat jenis transaksi **Korporat** dan template pelanggan **Pengadilan Negeri Batam** dipilih:

- Senin–Kamis: default **PE**.
- Jumat dan akhir pekan: default **PKH**.
- Pada hari libur nasional/cuti bersama: default **PKH**.
- Pada H-1 kalender sebelum libur nasional/cuti bersama: default **PKH**.
- Pengguna masih dapat mengganti kode layanan secara manual setelah default diterapkan.
- Jika halaman dibiarkan terbuka melewati pergantian tanggal, default diperbarui saat tab kembali aktif.
- Di bawah field kode layanan muncul alasan pemilihan default untuk mengurangi human error.

Contoh:

- Senin, 24 Agustus 2026 → **PKH**, karena H-1 Maulid Nabi.
- Selasa, 25 Agustus 2026 → **PKH**, karena hari libur Maulid Nabi.
- Rabu, 26 Agustus 2026 → **PE**.
- Jumat, 31 Juli 2026 → **PKH**.

Kalender 2026 memuat hari libur nasional dan cuti bersama berdasarkan SKB 3 Menteri Nomor 1497 Tahun 2025, Nomor 2 Tahun 2025, dan Nomor 5 Tahun 2025.

## Cara memasang di Windows

1. Ekstrak ZIP patch ini.
2. Pastikan repository `templatemile` sudah tersedia di komputer.
3. Jalankan:

   ```bat
   apply_patch.bat "C:\path\ke\templatemile"
   ```

Atau dengan Python:

```bash
python apply_patch.py "C:\path\ke\templatemile"
```

Script akan:

1. Membuat backup `index.html` dan `assets/js/ui.js` ke `.patch-backup/<timestamp>`.
2. Mengganti `assets/js/ui.js` dengan versi baru.
3. Mengubah cache-buster pada `index.html` menjadi `ui.js?v=20260731-1` agar browser tidak memakai file lama dari cache.

## Pengujian

Dari folder patch:

```bash
node tests/test-pn-batam-calendar.js
```

Semua pengujian harus menampilkan `PASS`.

## Catatan tahun berikutnya

Kalender libur yang ditanam saat ini khusus tahun 2026. Untuk 2027 dan seterusnya, tambahkan tanggal resmi baru ke objek `pnBatamNonWorkingDays` di `assets/js/ui.js` setelah SKB resmi terbit.


## Perbaikan v2

Installer sekarang aman dijalankan meskipun isi folder patch terlanjur diekstrak langsung ke folder repository. Jika file sumber dan target `assets/js/ui.js` sama, proses penyalinan akan dilewati dan pembaruan `index.html` tetap dilanjutkan.
