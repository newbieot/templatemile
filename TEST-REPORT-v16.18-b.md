# Laporan Uji v16.18

Tanggal uji: 16 Agustus 2026

## Ruang lingkup

- Allowlist karakter pada seluruh nilai data Excel.
- Pemeriksaan ulang sel setelah worksheet dibentuk.
- Jalur ekspor aplikasi utama dan halaman beta.
- Regresi REF/SURAT PN Batam, koreksi wajib, alamat luar Batam, scan-first, default 15 × 5, dan Gemini 3.7 Flash.
- Identitas cache v16.18.

## Aturan yang diuji

- Karakter khusus yang diizinkan: `. / - ( )`.
- Huruf, angka, dan spasi tetap diizinkan.
- Koma, garis bawah, ampersand, tanda kutip, titik dua, simbol formula, tanda baca ASCII lain, emoji, serta simbol lain tidak boleh tersisa pada nilai sel.
- Tab, baris baru, dan spasi berulang dirapikan menjadi satu spasi.
- Header schema Mile App tidak diubah karena underscore pada nama kolom merupakan bagian wajib format impor.

## Hasil

- Seluruh tanda baca ASCII diuji satu per satu; hanya `. / - ( )` yang bertahan.
- Data contoh berisi `@ # _ + , & = : ; ! ? % [ ] { }`, emoji, dan simbol lain berhasil dibersihkan.
- Karakter yang diizinkan tetap bertahan pada Nama, Alamat, dan REF/SURAT.
- Worksheet aktual berhasil dibuat, diserialisasi menjadi XLSX, dibuka kembali, lalu seluruh nilai sel data dipindai tanpa menemukan karakter terlarang.
- Guard yang sama aktif pada aplikasi utama dan halaman beta.
- REF/SURAT PN Batam tetap menjadi Nama Pengirim dan tetap wajib diisi.
- Koreksi `PERLU DICEK`, alamat luar Batam, PDF scan-first, Gemini 3.7 Flash, default 15 halaman × 5 jalur, serta profil koneksi normal tetap lulus.
- Semua JavaScript lulus pemeriksaan sintaks; Worker health mengembalikan `20260819-16.18`; seluruh referensi aset tersedia.

Kesimpulan: **LULUS**.
