# Laporan Uji v16.15

Tanggal uji: 16 Agustus 2026

## Ruang lingkup

- Periksa hasil tanpa kolom Pengirim.
- Sumber pengirim hanya dari template atau pengaturan awal.
- Deteksi koreksi wajib ketika `PERLU DICEK` menempel pada angka/huruf.
- Guard ekspor berbasis status data internal.
- Koreksi wajib alamat luar Kota Batam.
- Runtime PDF scan-first, default 15 halaman × 5 jalur, dan identitas cache baru.

## Hasil

- `1070PERLU DICEK47`, `PERLUDICEK`, dan variasi berspasi terdeteksi sebagai koreksi wajib.
- Ekspor gagal selama koreksi belum diubah, masih kosong, masih memuat penanda, atau belum dikonfirmasi selesai.
- Pengosongan massal No Ref tidak dapat menyelesaikan status koreksi wajib.
- Alamat luar Batam yang belum diubah tidak dapat disetujui.
- Alamat yang diubah tetapi masih menunjukkan kota/kode pos luar Batam tetap ditolak.
- Alamat yang sudah diperbaiki dengan bukti Batam/kode pos 294xx dapat disimpan.
- Kolom Pengirim dan input pengirim pengganti tidak muncul pada Periksa hasil/pemetaan.
- Hasil Excel memakai Nama Pengirim dari pengaturan awal.
- Seluruh JavaScript, referensi aset, Worker health, dan hasil ekstraksi ZIP lolos pengujian.

Kesimpulan: **LULUS**.
