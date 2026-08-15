# Laporan Uji v16.14

Tanggal uji: 16 Agustus 2026

## Ruang lingkup

- Runtime PDF scan-first tanpa pembacaan text layer.
- Gemini 3.7 Flash dengan default 15 halaman × 5 jalur.
- Audit gambar selektif dan penggabungan hasil per halaman.
- Tabel Periksa hasil untuk Paket dan Dokumen.
- Kode pos otomatis dua tingkat.
- Ekspor Dokumen tanpa input Berat, PxLxT, atau Kode Pos di tabel.
- Identitas versi dan referensi aset anti-cache.

## Hasil

- Seluruh JavaScript lolos pemeriksaan sintaks Node.js.
- Bundle AI tidak memuat pemanggilan `getTextContent` atau fungsi ekstraksi text layer.
- Isi permintaan AI hanya memakai gambar halaman dan prompt scan CamScanner.
- Audit ulang hanya menargetkan halaman hilang, ganda, atau meragukan.
- Mode Dokumen menampilkan urutan Nama Penerima → Alamat → Nomor HP, tanpa Kode Pos, Berat, dan PxLxT.
- Mode Paket tetap menampilkan Berat dan PxLxT, tanpa kolom Kode Pos.
- Ekspor Dokumen tanpa input tersembunyi berhasil memakai berat 0,2 kg dan dimensi 10 × 10 × 10 cm.
- Kode pos berhasil diambil dari angka lima digit pada alamat atau dari pemetaan wilayah sebagai fallback.
- Worker, HTML, CSS, JavaScript, dan PDF worker menggunakan identitas versi `20260816-16.14`.
- Template ASTRA, Bank Syariah Nasional, dan JACCS MPM tetap utuh.

Kesimpulan: **LULUS**.
