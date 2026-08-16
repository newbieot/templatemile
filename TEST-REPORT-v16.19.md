# Test Report v16.19

Tanggal: 16 Agustus 2026

## Ruang lingkup

- Prioritas Nomor/Nomor Surat/No. Surat/Ref resmi untuk kolom REF/SURAT.
- Normalisasi spasi OCR pada nomor surat resmi.
- Fallback Perihal/Hal/Subject bila nomor resmi tidak tersedia.
- Penghapusan label perihal dari nilai akhir.
- Fallback ke ID pesanan/resi bila nomor resmi dan perihal tidak ada.
- Penghapusan kode/resi panjang campuran huruf-angka dari Nama Penerima.
- Perlindungan nilai perihal ketika hasil audit AI tidak mengembalikan REF/SURAT.
- Perlindungan nomor resmi agar tidak diganti jenis/perihal surat oleh hasil zoom audit.
- Identitas aset dan health version v16.19 untuk Cloudflare Pages.

## Hasil

- `node --check _worker.js` — lulus.
- `node --check assets/js/app-core.js` — lulus.
- `node --check assets/js/ai-pdf-v16-19.js` — lulus.
- `node --check tests/ai-pdf-v16-19.test.js` — lulus.
- `node tests/ai-pdf-v16-19.test.js` — lulus.
- `git diff --check` — lulus; hanya terdapat peringatan konversi line ending Git pada Windows.

## Kasus regresi yang diverifikasi

- `FAHRUDIN 0028C20250400784` → Nama Penerima `FAHRUDIN`.
- `Nomor: 3166 /PAN.01.W32-U2/HK2. 4/VII/2026` → REF/SURAT `3166/PAN.01.W32-U2/HK2.4/VII/2026`.
- Nomor resmi tersebut tetap mengalahkan `Perihal` atau nomor perkara pada bagian Jenis Surat.
- `Perihal: Surat Pemberitahuan (SP1)` → REF/SURAT `SURAT PEMBERITAHUAN (SP1)`.
- `Perihal Penagihan dan Peringatan Terakhir` → REF/SURAT `PENAGIHAN DAN PERINGATAN TERAKHIR`.
- Label `Perihal:` pada baris terpisah dari isinya tetap terbaca melalui fallback `raw_lines`.
- `123/ABC` tetap dipakai ketika perihal tidak tersedia.
- Nama biasa `SITI NUR AINI` tidak berubah.

## Catatan verifikasi deployment

Setelah merge ke branch produksi dan deployment Cloudflare Pages selesai, periksa `/api/health` menampilkan `20260819-16.19`, lalu uji PDF nyata yang memuat perihal dan kode alfanumerik pada nama.
