# Catatan alur CN23 untuk kiriman dokumen

Dicatat dari demonstrasi pengguna pada 1 Oktober 2026 di https://expos.mile.app/new-transaction-custom. Catatan ini menjadi dasar alat bantu entri tujuan luar kota dari Batam. Pola Detail Item di bawah ditetapkan pengguna untuk kiriman dokumen. Pada demonstrasi pertama, pengguna memilih metode pembayaran dan menekan **Selesai**, lalu melaporkan gangguan web Mile tanpa bukti resi. Setelah layanan pulih, halaman resi untuk transaksi contoh lain diamati. Cabang korporat masih dicatat dari penjelasan pengguna dan belum didemonstrasikan.

## Status implementasi lokal

Persiapan data memiliki pilihan **Batam · Unggah Excel Mile**, **CN23 Dokumen Luar Kota**, dan **Campuran Batam + Luar Kota** pada halaman app, review, beta, serta Camera web. CN23 dan Campuran mempertahankan hasil luar Batam dan menentukan wilayah otomatis dari akhir alamat. Tidak ada pemilihan wilayah oleh operator. Mode tersimpan bersama sesi kamera dan hasil sinkronisasi.

Database `assets/data/postcodes-indonesia.json` dibuat dari 81.248 baris sheet `full` menggunakan `scripts/build-postcode-data.py`. Alias desa seperti PENGALIHAN / PENGALEHAN didukung. Database dimuat ketika menggunakan CN23 atau Campuran. Kota/provinsi terakhir membatasi kandidat; kecamatan/kelurahan yang jelas memakai kode rinci. Alamat tanpa kota/provinsi yang belum dapat dicocokkan jelas memakai default Batam 29411. Konflik petunjuk diselesaikan otomatis di dalam batas wilayah yang diketahui tanpa mengarang kelurahan.

APK membuka halaman review web yang sama, sehingga perubahan penentuan tujuan berlaku tanpa memasang ulang APK. Helper 0.2.10 menerima berat dokumen di atas 1 kg serta hasil dengan cakupan kota/kecamatan.

## Kasus kiriman campuran

Seluruh hasil berada di satu daftar pemeriksaan. Satu tombol **Unduh Excel** pada CN23 maupun Campuran membuat workbook unggah Mile untuk kelompok Batam dan workbook antrean CN23 untuk kelompok luar kota. Hanya kelompok berisi data yang diunduh: satu kelompok menghasilkan satu Excel, dua kelompok menghasilkan dua Excel.

| Data masuk | Hasil pemeriksaan | File hasil |
| --- | --- | --- |
| BELIAN, BATAM KOTA, BATAM | Wilayah nasional terpilih berada di Kota Batam | `Upload_MileApp_Ritel.xlsx`, sheet `Sheet1` |
| SMA NEGERI 2 KERITANG PENGALIHAN | PENGALIHAN / PENGALEHAN, KERITANG, INDRAGIRI HILIR, RIAU; 29274 | `Antrean_CN23_Dokumen_RITEL.xlsx`, sheet `CN23_ANTREAN` |
| SUKAMAJU tanpa kecamatan/kabupaten | Default Batam 29411 | Excel lokal Batam |
| Kode pos tercetak berbeda dari wilayah yang jelas | Kota/provinsi membatasi hasil; kecamatan/kelurahan yang jelas diprioritaskan | Kelompok tujuan ditentukan otomatis |
| Batch hanya berisi satu jenis tujuan | Satu kelompok berisi data, kelompok lain kosong | Satu Excel diunduh |

Klasifikasi lokal menggunakan kota/kabupaten hasil algoritma nasional, bukan awalan kode pos atau flag AI luar Batam. Penentuan tujuan tidak meminta intervensi operator. Perubahan alamat dan pemuatan Log Kamera lama menghitung ulang wilayah. Koreksi wajib dibatasi pada masalah konkret seperti teks PERLU DICEK, nama/alamat kosong, nama tidak terbaca, dan berat tidak valid.

Di Campuran, kode pos mengikuti wilayah database nasional yang terlihat pada tabel. Lampiran memuat Belian 29464, sedangkan pemetaan Batam lama memuat 29414; nilai tidak diganti diam-diam saat ekspor. Mode Batam tetap menggunakan aturan sebelumnya. Petugas perlu memeriksa perbedaan terhadap pilihan wilayah aktual Mile. Kode tujuan CN23 dibiarkan kosong dalam antrean sampai pilihan Mile diverifikasi.

Kasus pemisahan diuji dengan database nasional dan library SheetJS yang benar-benar dipakai aplikasi: dua workbook dibuat dan dibaca ulang, masing-masing berisi satu tujuan yang sesuai. Pengujian juga mencakup alamat ambigu, perpindahan mode, pembayaran korporat, dan pemeliharaan hasil kamera luar Batam.

## Pola Detail Item yang ditetapkan pengguna

| Kolom | Isian |
| --- | --- |
| Jenis barang / Nature of Goods | Dokumen / Documents |
| Kategori Pengiriman | Ecommerce/Biasa |
| NPWP | `000000000000000` (15 angka nol) |
| Kode HS | `49011000` |
| Label pilihan HS yang tampil | BROSUR BAHAN IKLAN DAGANG, KATALOG KOMERSIAL DAN SEJENISNYA: |
| Nama Barang | DOKUMEN |
| Quantity | 1 |
| Nilai Barang, Rupiah | 20000 |
| Berat / Weight (Kgs) | 0.2 |
| Negara Asal | ID |
| Jenis Kemasan | EN - Envelope |
| IMEI 1 | 0 |
| IMEI 2 | 0 |

Setelah proses hitung, kolom Jenis Kemasan menampilkan **EN - Envelope** dan terkunci, sehingga pilihan kemasan pada contoh ini sudah terverifikasi.

## Bagian pengiriman pada contoh

| Kolom | Isian |
| --- | --- |
| Service | PKH |
| COD | NON-COD |
| Jenis Barang | Dokumen |
| Instruksi Pengiriman | Tolong diantar dengan baik |
| Deskripsi | Dokumen |
| Panjang / Lebar / Tinggi (cm) | 0 / 0 / 0 |
| Jumlah koli | 1 |
| Asuransi | Tidak digunakan |

Nomor referensi, identitas, kontak, dan alamat adalah data masing-masing kiriman. Jangan menggandakan data contoh ke semua kiriman. Pengguna menjelaskan bahwa memilih **Insurance** melalui dropdown **Total PDRI** menambahkan bea asuransi; cabang ini belum didemonstrasikan.

## Nilai yang dihitung Mile.App

- Berat item 0.2 kg sudah mengisi otomatis kolom berat koli yang tidak dapat diedit menjadi 0.2 kg.
- Nilai item Rp20.000 sudah mengisi otomatis kolom Nilai Barang yang tidak dapat diedit menjadi 20000, meskipun contoh tanpa asuransi.
- Konversi USD dan kurs mengikuti nilai aplikasi, bukan nilai tetap preset.
- Nilai pajak dan Total PDRI harus berasal dari proses hitung aplikasi. Pada contoh ini, setelah proses hitung, BM, BMTPS, PPN, PPh, dan Total PDRI masing-masing 0. Jangan menetapkan hasil pajak nol secara tetap untuk semua transaksi.
- Pada contoh ini, tarif pengiriman dan total biaya transaksi Rp46.800, surcharge 0, berat aktual 0.2 kg, volume aktual 0 kg, dan chargeable 1 kg. Ini hasil contoh tujuan dan layanan yang dipilih, bukan tarif tetap preset.

## Perubahan setelah Proses Hitung PDRI

- Nature of Goods, Kategori Pengiriman, NPWP, dan seluruh rincian item menjadi tidak dapat diedit.
- Tombol **Proses Hitung PDRI** berubah menjadi **Ubah Data**.
- Tombol **Pembayaran** menjadi aktif.
- Pengirim, penerima, wilayah, dan bagian pengiriman masih ditampilkan sebagai kolom yang dapat diedit. Jika alat mengubah input yang memengaruhi hasil setelah perhitungan, hasil perlu diperiksa dan dihitung kembali melalui alur aplikasi yang sesuai. Perilaku penghitungan ulang setelah perubahan ini belum diuji.

## Pencocokan tujuan

Kolom `addressDetail` mencari wilayah melalui autocomplete. Pencarian **keritang** menampilkan beberapa kandidat. Pengguna melaporkan bahwa **keritang pengalihan** menghasilkan satu pilihan dan otomatis mengunci kode pos. Pemilihan akhir yang diamati: **KAB. INDRAGIRI HILIR, KERITANG, PENGALIHAN**, kode pos **29274**, kode tujuan **29274**.

Database lampiran, sheet `full`, baris 14523, mencatat **PENGALIHAN / PENGALEHAN**, Kecamatan **KERITANG**, **INDRAGIRI HILIR**, **RIAU**, kode pos **29274**. Pencocokan perlu mendukung alias desa dan dapat menurunkan kabupaten jika pasangan kecamatan/desa menghasilkan satu wilayah yang jelas.

Kode pos dan kode tujuan harus disimpan terpisah. Pada opsi **KEMUNING KERITANG KAB. INDRAGIRI HILIR**, Mile menampilkan kode pos **29276** dan kode tujuan **29274**, sedangkan database lampiran baris 14058 memuat kode pos **29274**. Perbedaan harus ditampilkan untuk pemeriksaan; jangan mengganti hasil pilihan Mile secara diam-diam.

## Cabang ritel dan korporat

| Tahap | Ritel | Korporat |
| --- | --- | --- |
| Awal entri | Isi data pengirim dan penerima | Isi Kode Pelanggan, tekan Enter, baru isi pengirim dan penerima |
| Wilayah dan rincian dokumen | Alur CN23 yang didemonstrasikan | Pengguna menjelaskan bahwa alurnya sama dengan ritel setelah Kode Pelanggan diproses |
| Metode pembayaran | Cash | Invoice atau CREDIT; tanpa Cash |
| Bukti saat ini | Panel dan opsi Cash diamati langsung | Urutan Kode Pelanggan serta opsi pembayaran dijelaskan pengguna; belum diamati langsung |

Untuk korporat, alat harus menunggu pemrosesan Kode Pelanggan berhasil sebelum mengisi data kiriman. Nomor pelanggan adalah konfigurasi operator atau sumber kiriman, bukan nilai yang dapat ditebak dari label. Invoice dan CREDIT harus diperlakukan sebagai pilihan berbeda sampai opsi aktual pada panel korporat diperiksa. NON-COD adalah isian COD pada pengiriman dan berbeda dari metode pembayaran transaksi.

## Panel pembayaran ritel yang diamati

- Judul panel: **Pembayaran**.
- Total Tagihan pada contoh: **46.800,00**.
- Dropdown **Metode Pembayaran** terbuka dan hanya menampilkan **Cash**.
- Tombol **Selesai** dan **Close** tersedia.
- Pengguna kemudian memilih metode pembayaran dan menekan **Selesai**. Panel pembayaran sudah hilang, tetapi tidak muncul nomor resi atau bukti transaksi tersimpan pada pengamatan terbaru. Pengguna melaporkan gangguan web Mile. Status pengiriman hasil submit ini belum pasti.
- Menurut pengguna, setelah transaksi berhasil, aplikasi menampilkan resi yang siap dicetak. Pengguna menghendaki tampilan cetak dilewati, lalu kembali ke https://expos.mile.app/new-transaction-custom untuk data berikutnya. Petugas mencetak resi secara manual belakangan.
- Pada sesi gangguan, tampilan sukses, nomor resi, dan mekanisme cetak belum diamati. Halaman Print Data untuk contoh Jakarta kemudian diamati setelah layanan pulih; deteksi otomatis hasil submit untuk baris aktif masih perlu diuji.

## Urutan yang telah ditunjukkan

### Pengamatan setelah layanan pulih

Pada 1 Oktober 2026 pengguna menyatakan layanan sudah normal dan membuka tab **Print Data**. Halaman resi yang diamati memuat barcode/nomor kiriman, kode transaksi, pengirim/penerima, tujuan GAMBIR — GAMBIR — KOTA ADM. JAKARTA PUSAT (10110), berat 0,2 kg, dimensi 0×0×0, nilai isi Rp20.000, asuransi Rp0, serta rincian biaya dan pajak. Tampilan ini memverifikasi hasil cetak untuk transaksi contoh Jakarta. Form Keritang yang diamati sebelumnya masih berada pada panel pembayaran; resi Jakarta tidak membuktikan submit Keritang yang terganggu berhasil.

Tab resi berada pada host `apiexpos.mile.app`, route `/api/v2/print-data`, dengan parameter `data_source=connote`, `parameter_id=<ID transaksi>`, `parameter_fields=connote_id`, dan `display_field=koli_code`. Nomor kiriman terlihat di daftar pilihan dan area `#section-to-print`; kode transaksi serta data tujuan tampil pada resi. Tautan **Print** tersedia, tetapi tidak dijalankan oleh alat.

Penghubung harus menangkap tab/identitas resi **baru** yang muncul setelah submit untuk baris aktif, membaca nomor kiriman dan kode transaksi, serta mencocokkan data kiriman. Jangan menggunakan tab resi lama sebagai penanda sukses. Setelah bukti cocok tersimpan, lewati Print dan kembali ke form CN23. Jika bukti tidak dapat dicocokkan, pertahankan status hasil belum pasti dan minta pemeriksaan. Endpoint tersebut diamati dari tampilan browser; ini belum menjadi integrasi API resmi.

Halaman `report-lite` yang terbuka pada pengamatan ini menampilkan No Data dengan filter PAID. Karena itu laporan tersebut belum tervalidasi sebagai cara rekonsiliasi/cetak ulang batch; ketersediaan halaman cetak tidak otomatis memvalidasi seluruh alur pencarian resi belakangan.

1. Tentukan ritel atau korporat. Untuk korporat, isi Kode Pelanggan dan tekan Enter terlebih dahulu; setelah pelanggan diproses, isi pengirim, penerima, kontak, dan alamat.
2. Cari dan tetapkan wilayah tujuan melalui autocomplete.
3. Isi Service, Jenis Barang, nomor referensi, instruksi, dan deskripsi; tentukan asuransi.
4. Isi Nature of Goods, Kategori Pengiriman, dan rincian item dengan pola dokumen di atas.
5. Klik **Proses Hitung PDRI**. Periksa rincian item terkunci, hasil pajak muncul, tombol berubah menjadi Ubah Data, dan Pembayaran aktif.
6. Klik **Pembayaran**. Periksa tagihan dan opsi metode yang sesuai dengan jenis pelanggan. Untuk ritel, opsi Cash sudah diamati; untuk korporat, pengguna menyebut Invoice atau CREDIT.
7. Pilih metode pembayaran yang sesuai, kemudian tekan **Selesai**.
8. Tunggu bukti transaksi berhasil, catat nomor resi/identitas transaksi, lalu tandai kiriman berhasil. Nomor kiriman, kode transaksi, dan identitas tab Print Data telah diamati untuk contoh lain; pengaitan otomatis dengan submit baris aktif belum diuji.
9. Lewati pencetakan dan kembali ke https://expos.mile.app/new-transaction-custom untuk memproses data berikutnya. Petugas mencetak manual belakangan. Halaman Print Data telah diamati untuk contoh lain setelah layanan pulih; pemicu perpindahan dari Selesai dan deteksi otomatisnya belum diuji oleh alat.

## Implikasi untuk implementasi

Pisahkan preset operator, data setiap kiriman, dan nilai hasil perhitungan Mile. Pertahankan nol untuk dimensi, nilai deklarasi Rp20.000 saat tanpa asuransi, dan deskripsi Dokumen yang terpisah dari nomor referensi. Adapter CN23 perlu mengisi item terlebih dahulu dan memeriksa propagasi berat/nilai pada form. Pola ekspor Excel yang ada perlu ditinjau sebelum digunakan kembali karena memiliki aturan default dimensi, deskripsi, dan nilai asuransi yang berbeda.

Rancangan operasi harian: kamera/PDF/Excel masuk ke daftar pemeriksaan, lalu petugas menetapkan mode pelanggan, preset, dan metode pembayaran sebelum menjalankan antrean. Penghubung browser mengisi form, menghitung PDRI, mengisi pembayaran yang tersedia sesuai konfigurasi, dan menyelesaikan tiap transaksi. Finalisasi dan antrean berikutnya otomatis pada ekstensi 0.2.0; kelanjutan menunggu resi baru yang cocok.

## Rancangan otomatisasi berbasis Mile Camera

Pilihan utama adalah mode **CN23 Dokumen Luar Kota** pada aplikasi persiapan kiriman yang sudah ada, ditambah ekstensi browser pada Chrome di PC loket. Ekstensi menggunakan tab Mile yang sudah login dan berinteraksi dengan form, autocomplete, dan dropdown yang telah ditunjukkan. Kemampuan ekstensi untuk membaca/mengubah halaman didukung dokumentasi Chrome; kesesuaian event dan selector dengan Mile harus diuji langsung.

### Alur petugas

1. Pilih mode CN23 Dokumen Luar Kota, ritel/korporat, pengirim, layanan, berat/nilai preset, asuransi, dan metode pembayaran. Untuk korporat, siapkan Kode Pelanggan.
2. Capture label berurutan dengan Mile Camera.
3. AI membaca data penerima, alamat, kontak, dan referensi dari tiap label. Jangan menebak kontak/referensi yang tidak tersedia.
4. Cocokkan wilayah dengan database nasional dan tampilkan kandidat yang ambigu untuk pemeriksaan. Hasil foto dan baris antrean tetap terhubung.
5. Periksa dan koreksi daftar kiriman sebelum menandainya siap. Hasil Excel tetap bisa diunduh untuk arsip dan untuk membawa batch ke PC pada versi awal.
6. Muat batch ke penghubung CN23 di PC dan jalankan antrean satu transaksi pada satu waktu. Versi awal dapat mengimpor Excel hasil kamera; koneksi langsung hasil kamera ke antrean dapat ditambahkan kemudian.
7. Untuk korporat, proses Kode Pelanggan dan Enter terlebih dahulu. Isi data tiap kiriman, pilih hasil autocomplete yang cocok, terapkan pola dokumen, dan jalankan hitung PDRI.
8. Baca biaya/perhitungan aplikasi. Gunakan metode pembayaran yang tersedia dan sudah ditetapkan operator. Bila pilihan yang diharapkan tidak tersedia atau terjadi perubahan tidak terduga, hentikan antrean untuk pemeriksaan.
9. Selesaikan transaksi, verifikasi sukses, catat nomor resi, lewati cetak, lalu buka form CN23 baru untuk baris berikutnya.
10. Sediakan daftar kiriman berhasil dan nomor resi sebagai dasar pencetakan manual petugas belakangan. Cara membuka ulang/cetak resi pada Mile perlu diamati sebelum fitur bantuan cetak dibuat.

### Data dan status antrean

Simpan ID batch, ID baris, ID capture, data penerima, alamat, kontak/referensi, wilayah terkonfirmasi, kode pos, kode tujuan, konfigurasi pelanggan, metode pembayaran, status, waktu submit, jumlah percobaan, nomor resi/ID transaksi, dan pesan kendala. Status dan hasil perlu disimpan sebelum berpindah halaman; foto tetap berada di penyimpanan batch, bukan digandakan ke tiap catatan transaksi.

| Status | Makna |
| --- | --- |
| Perlu diperiksa | Alamat/isian belum lengkap atau cocok ke beberapa wilayah |
| Siap | Data sudah diperiksa dan dapat diisi |
| Sedang diisi | Form untuk baris ini sedang dikerjakan |
| Sedang dikirim | Selesai sudah akan/sudah ditekan; menunggu hasil server |
| Berhasil | Bukti sukses dan nomor resi/ID transaksi telah diperoleh |
| Hasil belum pasti | Submit sudah dilakukan, tetapi hasil tidak dapat dipastikan |

Gangguan setelah **Selesai** tidak membuktikan transaksi gagal. Server mungkin sudah menyimpan kiriman. Simpan status **Sedang dikirim** sebelum klik final; bila konfirmasi hilang atau waktu tunggu habis, ubah menjadi **Hasil belum pasti**, jeda antrean, dan periksa transaksi di Mile sebelum mencoba ulang. Jangan memicu submit ulang otomatis. ID lokal hanya mencegah pengulangan oleh alat; tidak membuktikan bahwa server Mile mendukung deduplikasi.

### Tahap pembangunan dan pengujian

1. Mode luar kota dan Campuran, pencocokan nasional, serta dua ekspor terpisah dengan pola dokumen sudah diimplementasikan dan diuji lokal.
2. Ekstensi mengimpor Excel/batch dan mengisi satu transaksi sampai hasil PDRI serta pembayaran siap; uji pemilihan wilayah, field yang bergantung pada dropdown, dan propagasi berat/nilai.
3. Hubungkan penanda halaman Print Data yang sudah diamati dengan baris aktif, lalu uji korporat, perubahan pelanggan, cetak ulang, serta gangguan di sekitar submit.
4. Aktifkan pemrosesan antrean otomatis berikutnya hanya setelah status sukses/hasil belum pasti dan pemulihan sudah teruji. Uji perubahan tarif, opsi pembayaran yang berbeda, data ambigu, dan pemuatan ulang browser.

Ekstensi Manifest V3 0.2.1 tersedia di `extensions/mile-cn23` dan `downloads/Mile-CN23-Helper-0.2.1.zip`. Klik ikon pada tab Mile yang sudah terbuka → Upload Excel → Start. Kode Pelanggan/Enter dan pengirim korporat dari Mile dimuat otomatis; Cash/Invoice/CREDIT dan Selesai diproses otomatis. Pembukaan dropdown diulang jika transisi mengabaikan klik pertama. Redirect daftar transaksi kembali ke form CN23; antrean dilanjutkan setelah resi baru cocok dan semua kolom form baru siap. Sinyal kesiapan halaman yang sedang diisi tidak digunakan untuk kiriman berikutnya. Semua selesai memunculkan notifikasi. Uji integrasi tiga kiriman menggabungkan script form, background, dan pembaca resi dengan satu Start, ritel/korporat, resi sebelum/sesudah redirect, serta kolom referensi terlambat; submit produksi dengan ekstensi Chrome terpasang belum dilakukan.

APK 0.1.3 memakai capture cepat dari source 0.1.2 pengguna. Mode tujuan disimpan dalam draft native dan diteruskan ke review web. Mode dikunci setelah foto pertama; batch baru mempertahankan pilihan sebelumnya dan dapat diganti sebelum capture. APK lama default Lokal Batam. Foto luar kota/Campuran menolak handoff ke web lama yang belum mendukung pemilih tujuan. Pencocokan nasional berlangsung di web saat hasil AI diperiksa, bukan OCR offline di APK. Log kamera mencatat jumlah Lokal Batam, Luar Kota Batam, dan Tujuan belum pasti berdasarkan wilayah yang masih sesuai dengan alamat terbaru.

Referensi teknis:

- [Chrome Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) untuk kemampuan membaca dan mengubah DOM halaman.
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) untuk penyimpanan status antrean/configurasi ekstensi. Batasi persistensi data sesuai kebutuhan operasional.
