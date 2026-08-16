# Laporan Uji v16.16

Tanggal uji: 16 Agustus 2026

## Ruang lingkup

- Sumber Nama Pengirim untuk template Pengadilan Negeri Batam.
- Validasi REF/SURAT wajib pada PN Batam.
- Regresi tabel tanpa Pengirim, koreksi wajib, alamat luar Batam, dan PDF scan-first.
- Identitas cache v16.16.

## Hasil

- REF/SURAT `SURAT-9` menghasilkan `origin_data_customer_name` bernilai `SURAT-9` pada template PN Batam.
- Ekspor PN Batam dengan REF/SURAT kosong dibatalkan.
- ID pelanggan PN Batam tetap `LNMAPN01294A`.
- Template lain tetap mengambil pengirim dari template atau pengaturan awal.
- No Ref/Surat tetap tampil dan dapat diedit; Pengirim tetap tidak tampil pada Periksa hasil.
- Deteksi `PERLU DICEK` menempel angka, guard alamat luar Batam, default 15 × 5, dan scan-first tetap lulus.
- Seluruh JavaScript, referensi aset, Worker health, dan hasil ekstraksi ZIP lolos pengujian.

Kesimpulan: **LULUS**.
