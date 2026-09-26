# Changelog

## v25.13 — Kamera 15 gambar dalam gelombang paralel 5×3

- Mengubah ekstraksi kamera dari satu request 15 gambar menjadi tiga request paralel berisi lima gambar.
- Urutan hasil tetap digabung berdasarkan nomor halaman dan default tetap GLM 5.3 FlashX tanpa R2.
- Ketika provider mengembalikan HTTP 429, jumlah jalur aktif diturunkan dan retry diberi jeda bertahap untuk mencegah retry serentak.

## v25.12 — Kamera langsung memakai JPEG tanpa putaran PDF

- Finish Capture menyimpan blob JPEG hasil crop langsung ke IndexedDB tanpa membangun PDF.
- Halaman review mengirim JPEG kamera langsung ke AI dalam kelompok maksimal 15, tetap tanpa R2.
- JPEG asli dipertahankan selama ukuran batch aman; kompresi adaptif hanya dipakai untuk mencegah payload melewati batas gateway.
- Sesi kamera lama berbentuk PDF tetap dapat diproses melalui jalur kompatibilitas.

## v25.11 — Proses AI kamera kembali terlihat

- Memperbaiki ketidaksesuaian ID modal antara halaman `/review` dan runtime AI yang membuat pemrosesan setelah Finish Capture berjalan tanpa overlay progres yang terlihat.
- Menampilkan tahap proses, waktu berjalan, progres render/upload, jumlah halaman dan batch, status koneksi, serta aktivitas AI secara langsung.
- Menambahkan tes kontrak DOM untuk seluruh elemen progres yang digunakan runtime AI.

## v25.10 — Kamera Direct AI, batch 15 gambar

- Mengunci jalur `/camera` dan `/review` ke pengiriman gambar base64 langsung melalui Secure Gateway tanpa upload, referensi, atau cleanup R2.
- Menetapkan `glm-5.3-flashx` sebagai model default kamera dan memastikan keluarga GLM (`glm-5.3`, `glm-5.3-flashx`, `glm-5.3-flash`) tersedia.
- Menambahkan pilihan `gemini-3.8-flash` dan `gemini-3.7-flash` pada halaman kamera.
- Mengirim maksimal 15 gambar dalam satu request AI dan membatasi satu request kamera aktif pada satu waktu untuk menjaga stabilitas serta urutan hasil.
- Menambahkan tes regresi khusus model kamera, ukuran batch, mode jaringan, payload multimodal 15 gambar, dan bypass R2.

## v16.42 — Feedback capture lengkap dan kontrol fullscreen finish

- Menambahkan suara klik shutter instan menggunakan Web Audio API tanpa download aset tambahan.
- Menambahkan animasi kilat visual layar (flash overlay) dan notifikasi HUD mengambang langsung di layar bidik kamera (`cameraStage`) agar terlihat jelas di mode fullscreen.
- Menambahkan getaran ganda haptic feedback saat capture berhasil diambil di HP.
- Menambahkan tombol **Finish Capture** di toolbar kontrol mode fullscreen agar operator dapat menyelesaikan batch secara langsung tanpa harus keluar fullscreen.
- Memperbaiki bug status `captureBusy` yang menyebabkan tombol Finish Capturing terkunci disabled setelah foto tersimpan di daftar tangkapan.
- Memperbarui evaluasi tombol penyelesaian batch di blok pembersihan sehingga tombol selalu aktif saat batch berisi minimal 1 gambar.

## v16.41 — Fullscreen capture tanpa validasi yang memblokir

- Mengubah **Open Camera** agar langsung membuat sesi, membuka preview fullscreen, dan mengaktifkan tombol Capture tanpa langkah Start Capture Session.
- Menambahkan kontrol Capture dan jumlah gambar di dalam fullscreen, serta tombol keluar untuk meninjau batch dan menekan Finish Capturing.
- Menyesuaikan preview dan koordinat crop terhadap area video sebenarnya pada posisi HP portrait maupun landscape.
- Mengubah pemeriksaan resolusi, blur, dan brightness menjadi metadata non-blocking; setiap capture tetap masuk dan dapat diperiksa atau dihapus operator.
- Menggunakan area panduan tetap sebagai fallback crop ketika confidence auto crop rendah, tanpa meminta operator mengulang foto.

## v16.40 — Mobile camera batch capture

- Menambahkan halaman terlindungi `/camera` yang memakai kamera belakang HP Android langsung melalui `navigator.mediaDevices.getUserMedia()`.
- Menambahkan sesi capture batch dengan session ID, capture ID, timestamp, nomor urut, preview, hapus hasil, dan tombol Finish Capturing.
- Menjalankan auto crop ringan di browser untuk membuang background meja serta menolak deteksi ber-confidence rendah.
- Menolak foto yang buram, terlalu gelap/terang, atau memiliki resolusi crop terlalu kecil sebelum foto masuk batch.
- Mengemas hasil crop menjadi PDF lokal dan meneruskannya ke pipeline yang sudah ada: `/app` untuk pemrosesan standar atau `/beta` untuk R2 + DeepSeek 4.1.
- Menyimpan batch sementara di IndexedDB dan menghapusnya setelah pemrosesan selesai; credential dan secret tetap hanya berada di Cloudflare.
- Mengizinkan permission camera hanya pada route `/camera`, sedangkan route lainnya tetap memakai kebijakan `camera=()`.

## Hotfix 2026-09-24 — Kode pos Bengkong Sadai

- Mengoreksi kode pos lama `29457` menjadi `29426` ketika alamat menunjukkan Kelurahan Sadai, Kecamatan Bengkong.
- Menerapkan koreksi pada pipeline PDF utama dan Beta serta mengganti identitas cache `app-core.js` agar perbaikan langsung dimuat setelah deployment.

## v16.39 — DeepSeek R2 URL sebagai default Beta

- Menjadikan `deepseek-v4.1-flash` sebagai model default khusus `/beta`.
- Memastikan halaman Beta selalu mengirim gambar ke DeepSeek sebagai URL R2 sementara, tanpa fallback base64 ketika unggahan R2 gagal.
- Mempertahankan 15 halaman × 5 jalur, render lokal maksimal dua gambar, serta Gemini 3.8 → 3.7 → 3.6 sebagai pilihan dan fallback terpisah.

## v16.38 — Fallback Gemini bertingkat

- Mengubah fallback otomatis pada versi utama dan Beta menjadi Gemini 3.8 Flash → Gemini 3.7 Flash → Gemini 3.6 Flash.
- Memastikan gangguan Gemini 3.7 Flash diteruskan ke Gemini 3.6 Flash tanpa memakai Qwen.
- Mempertahankan Qwen sebagai pilihan eksperimen manual, bukan fallback otomatis.
- Mencatat seluruh model yang benar-benar dipakai dalam metrik pemrosesan.
- Menambahkan `deepseek-v4.1-flash` sebagai pilihan eksperimen Beta yang menerima tautan gambar R2 sementara, tanpa mengubah model default.

## v16.37 beta — Turbo langsung 15 × 5

- Menghapus antrean upload R2 per halaman dari jalur normal; JPEG ringan dikirim langsung ke Gemini 3.8 Flash.
- Meningkatkan kelompok ekstraksi menjadi 15 halaman × 5 jalur sambil mempertahankan render lokal maksimal dua halaman agar PC lawas tetap responsif.
- Menurunkan tahap pertama menjadi 1150 px dengan kualitas JPEG 72% dan menonaktifkan audit kedua pada preset Turbo.
- Mempertahankan R2 sebagai mode pemulihan pada profil Hemat data dan Qwen 3.7 Flash hanya sebagai fallback kelompok yang gagal.
- Memperbarui tes koneksi agar menguji jalur yang benar-benar dipilih pengguna.

## v16.36 beta — Jembatan R2 langsung ke Gemini

- Mempertahankan R2 sebagai penyangga gambar, tetapi menghentikan pengiriman URL R2 langsung ke Gemini.
- Menambahkan jembatan pada Cloudflare Worker yang memvalidasi referensi berdasarkan sesi, mengambil JPEG dari R2, lalu menyisipkan base64 ke permintaan CosmosHub.
- Mengubah preset cepat menjadi 6 halaman × 3 jalur AI, sementara render browser tetap maksimal dua halaman bersamaan.
- Membatasi jembatan maksimal delapan gambar dan 8 MB data JPEG mentah per permintaan agar penggunaan memori Worker tetap terkendali.
- Mengubah tes layanan Beta agar benar-benar mengunggah dan membaca satu gambar melalui R2, Worker, dan model yang dipilih.
- Mempertahankan fallback base64 per halaman jika upload R2 gagal serta fallback Qwen hanya untuk kelompok yang gagal setelah retry Gemini.

## v16.35 beta — Pipeline adaptif untuk PC lama

- Menurunkan render Beta menjadi maksimal dua halaman bersamaan pada resolusi awal 1600 px/JPEG 79%.
- Mengganti preset berat 15 × 5 menjadi kelompok 10 halaman dengan dua jalur awal dan maksimum tiga jalur setelah respons Gemini pertama berhasil.
- Membatasi waktu tunggu Gemini per permintaan menjadi 75 detik dan mencoba gangguan provider sekali lagi setelah 0,5 detik.
- Mengubah fallback Qwen menjadi per kelompok; kegagalan satu kelompok tidak lagi memindahkan seluruh sisa PDF dari Gemini.
- Mencoba ulang upload R2 satu kali dan memakai base64 hanya untuk halaman yang tetap gagal, tanpa mematikan R2 untuk seluruh pekerjaan.
- Menunda audit selektif sampai ekstraksi awal selesai dan menjalankannya satu jalur agar tidak berebut kapasitas AI.
- Menampilkan model, rentang halaman, tahap, dan waktu berjalan untuk setiap jalur aktif serta memperkaya metrik tanpa menyimpan isi dokumen.

## v16.34 beta — Render tiga halaman

- Menaikkan pool render khusus `/beta` dari satu menjadi maksimal tiga halaman bersamaan agar penyiapan gambar lebih cepat.
- Mempertahankan kelompok 15 halaman × 5 jalur AI, Gemini 3.8 Flash sebagai default, dan Qwen 3.7 Flash sebagai fallback otomatis.
- Tidak mengubah pipeline PDF pada versi utama `mile.posnew.com`.

## v16.33 — Gemini 3.8 default dan Beta klasik dipulihkan

- Menjadikan Gemini 3.8 Flash sebagai model default pada `/beta` dan versi utama `mile.posnew.com`.
- Mengembalikan Beta ke render satu halaman pada satu waktu dengan preset 15 halaman × 5 jalur AI.
- Mengaktifkan kembali fallback otomatis dari Gemini 3.8 Flash ke Qwen 3.7 Flash pada Beta; fallback versi utama tetap aktif.
- Tetap menghapus pemeriksaan AI awal sehingga render halaman langsung dimulai dan proses tidak berhenti di tahap menyiapkan jalur ringan.
- Mempertahankan deteksi LAN yang aman serta batas upload 15 detik agar gangguan tidak membuat tampilan diam tanpa progres.

## v16.32 beta — Beban AI dibatasi 8 × 2

- Mengubah preset dan profil normal menjadi 8 halaman per permintaan × maksimal 2 jalur AI.
- Mengunci batas runtime pada 8 × 2 serta menghapus pilihan 10/15 halaman dan 3/4 jalur dari Beta.
- Mengganti kunci konfigurasi sesi agar nilai 15 × 4 dari tab atau rilis lama tidak dapat aktif kembali.
- Membatasi beban aktif menjadi maksimal 16 gambar halaman pada AI dalam satu waktu.

## v16.31 beta — Retry Gemini seketika

- Menganggap waktu `reset after` dari provider sebagai perkiraan, bukan waktu tunggu wajib.
- Menggunakan jeda retry hanya 0,5 detik untuk setiap gangguan sementara, termasuk saat provider memberikan estimasi reset yang lebih lama.
- Tetap membatasi proses menjadi maksimal tiga percobaan tanpa beralih ke Qwen atau model lain.

## v16.30 beta — Menunggu slot Gemini secara otomatis

- Mengenali respons CosmosHub `No active credentials for provider: antigravity` sebagai gangguan sementara, bukan model yang hilang permanen.
- Membaca waktu `reset after` dari provider, menunggu sampai slot Gemini tersedia, lalu mencoba Gemini 3.7 Flash lagi tanpa beralih ke Qwen.
- Menampilkan hitung mundur selama provider mereset kredensial agar proses tidak terlihat diam atau macet.

## v16.29 beta — Gemini 3.7 Flash dikunci

- Mengunci seluruh permintaan AI Beta ke Gemini 3.7 Flash, termasuk permintaan ekstraksi, perbaikan JSON, dan verifikasi.
- Menghapus fallback otomatis ke Qwen maupun model lain dari runtime Beta.
- Mempertahankan maksimal tiga percobaan saat terjadi gangguan sementara, dengan semua retry tetap menggunakan Gemini 3.7 Flash.
- Menyederhanakan pilihan model pada tampilan Beta agar status model terkunci terlihat jelas.

## v16.28 beta — Beban AI lebih stabil

- Mengembalikan kelompok cepat dari 18 menjadi 15 halaman agar model vision lebih konsisten membaca seluruh halaman.
- Mengunci Beta maksimal 15 halaman × 4 jalur AI; opsi 18/20 halaman dan jalur kelima dihapus agar provider tidak menerima beban berlebihan.
- Mempertahankan optimasi render dua halaman, resolusi 1600 px, pengiriman R2, dan penghapusan pemeriksaan AI awal dari v16.27.
- Mengganti penyimpanan konfigurasi sesi agar nilai 18 × 5 dari rilis sebelumnya tidak terbawa pada tab lama setelah dimuat ulang.

## v16.27 beta — Pipeline cepat tanpa jeda pemeriksaan awal

- Menghapus permintaan AI pemeriksaan URL sebelum dokumen diproses; kesiapan jalur gambar sekarang diambil langsung dari health Secure Gateway sehingga progres halaman dimulai seketika.
- Menyiapkan maksimal dua halaman secara paralel dengan pool terbatas dan tetap membatasi AI hingga lima jalur agar PC lama tetap responsif.
- Mengubah preset cepat menjadi 18 halaman × 5 jalur sehingga PDF 90 halaman dapat diproses dalam satu gelombang AI, serta memperkecil gambar awal menjadi 1600 px/JPEG 79% untuk mengurangi waktu render dan upload.
- Memperpendek batas upload per gambar dari 90 detik menjadi 15 detik agar jalur cadangan segera digunakan bila R2 terganggu.

## v16.26 — Perbaikan deteksi koneksi LAN

- Menjadikan `navigator.onLine` sebagai petunjuk saja karena status browser/Windows dapat keliru pada komputer lama yang memakai LAN.
- Versi biasa dan beta sekarang tetap mencoba Secure Gateway serta memakai retry nyata, bukan berhenti tanpa batas menunggu status `online`.
- Mencegah status LAN yang keliru menurunkan profil normal menjadi 4 halaman × 1 jalur dan memperbarui pesan koneksi agar tidak menyatakan internet terputus sebelum server benar-benar dicoba.

## v16.25 — Tautan versi ringan untuk komputer lambat

- Menambahkan kartu ajakan di halaman utama yang mengarahkan pengguna komputer lama atau berspesifikasi rendah ke `/beta`.
- Memperjelas halaman beta sebagai versi ramah komputer lambat dengan mode ringan yang sedang aktif.
- Mengganti istilah teknis R2 pada tampilan pengguna dengan bahasa yang lebih sederhana tanpa mengubah pipeline R2 di belakang layar.

## v16.24 beta — Pipeline gambar sementara R2 untuk PC lawas

- Menambahkan eksperimen terisolasi di `/beta`; halaman produksi `/app` dan runtime stabilnya tidak diubah.
- Merender halaman PDF satu per satu langsung ke ukuran JPEG akhir agar beban CPU, RAM, dan jeda antarmuka lebih rendah pada komputer lawas.
- Tetap menjalankan ekstraksi AI hingga 5 jalur dengan kelompok 15 halaman, tetapi tidak lagi merender 5 kelompok secara bersamaan.
- Mengunggah JPEG secara berurutan ke R2 dan mengirim URL bertanda tangan yang ringan ke CosmosHub, sehingga Worker tidak perlu mem-parsing payload base64 berukuran besar.
- Menguji kemampuan CosmosHub membaca URL gambar secara otomatis untuk setiap model dan kembali ke JPEG base64 bila pengujian gagal.
- Menghapus gambar R2 setelah pemrosesan; lifecycle bucket satu hari menjadi pengaman bila tab/browser terputus.

## v16.23 — Fallback otomatis Gemini ke Qwen

- Gemini 3.7 Flash tetap menjadi model utama dan default.
- Jika Gemini 3.7 gagal karena timeout, rate limit, gangguan upstream, model tidak tersedia, atau respons JSON rusak setelah retry, proses otomatis dilanjutkan dengan Qwen 3.7 Flash.
- Peralihan model ditampilkan pada progres dan dicatat pada statistik pemrosesan. Error autentikasi atau izin tidak memicu fallback.

## v16.22 — Alternatif Qwen Vision yang lebih hemat

- Menambahkan Qwen 3.7 Plus sebagai eksperimen kualitas dan Qwen 3.7 Flash sebagai eksperimen hemat untuk ekstraksi PDF berbasis gambar.
- Mempertahankan Gemini 3.7 Flash sebagai default stabil serta profil Cepat 15 halaman × 5 jalur.
- Menambahkan kedua model Qwen ke allowlist browser dan Cloudflare gateway serta memperbarui identitas aset.

## v16.21 — Kembali ke Gemini 3.7 Flash sebagai default

- Mengembalikan Gemini 3.7 Flash sebagai default stabil setelah Gemini 3.8 Flash menunjukkan latensi tinggi, konsumsi output besar, dan retry berulang pada PDF panjang.
- Gemini 3.8 Flash tetap tersedia sebagai pilihan eksperimental dengan perbaikan kompatibilitas payload yang sudah diterapkan.
- Mempertahankan profil Cepat 15 halaman × 5 jalur dan memperbarui identitas aset agar rollback langsung diterima browser.

## v16.20 — Gemini 3.8 Flash default dan stabil

- Menghapus `temperature` dan `top_p` dari payload Gemini 3.8 Flash sesuai aturan API model terbaru.
- Membuat tes layanan AI memakai structured JSON yang sama dengan alur PDF agar kegagalan kompatibilitas terdeteksi sebelum pemrosesan.
- Menjadikan Gemini 3.8 Flash sebagai default dengan profil Cepat 15 halaman × 5 jalur, serta memperbarui identitas aset agar browser memuat runtime baru setelah deployment.

## v16.19 — Perihal surat dan pembersihan nama penerima

- Memprioritaskan nomor surat resmi setelah label `NOMOR`, `NOMOR SURAT`, `NO. SURAT`, atau `REF` sebagai nilai `REF/SURAT`.
- Menormalkan spasi OCR pada nomor resmi, misalnya `3166 /PAN.01.W32-U2/HK2. 4/VII/2026` menjadi `3166/PAN.01.W32-U2/HK2.4/VII/2026`.
- Mempertahankan nomor resmi terstruktur ketika zoom audit AI hanya melihat jenis/perihal surat dan tidak lagi melihat kepala surat.
- Memakai isi setelah label `PERIHAL`, `HAL`, atau `SUBJECT` sebagai fallback bila nomor surat resmi tidak tersedia; labelnya tidak ikut disimpan.
- Menambahkan contoh eksplisit agar `Surat Pemberitahuan (SP1)` serta `Penagihan dan Peringatan Terakhir` dapat masuk ke kolom `REF/SURAT`.
- Menghapus token kode/resi panjang campuran huruf-angka dari nama penerima melalui prompt AI dan pengaman lokal sebelum data masuk tabel maupun Excel.
- Menjamin `FAHRUDIN 0028C20250400784` disimpan sebagai `FAHRUDIN`.
- Mengganti bundle AI menjadi `ai-pdf-v16-19.js` dan identitas aset menjadi `20260819-16.19` untuk memutus cache immutable Cloudflare.

## v16.18 — Filter karakter ketat pada data Excel

- Menyaring seluruh nilai string tepat sebelum worksheet dibuat; hanya huruf, angka, spasi, serta `. / - ( )` yang diizinkan.
- Menghapus koma, garis bawah, tanda kutip, ampersand, simbol formula, emoji, dan karakter khusus lain dari data hasil ekspor.
- Memeriksa ulang setiap sel data setelah worksheet dibentuk dan membatalkan ekspor bila karakter terlarang masih ditemukan.
- Menerapkan perlindungan yang sama pada aplikasi utama dan halaman beta; header baku Mile App tetap dipertahankan.
- Mengganti bundle AI menjadi `ai-pdf-v16-18.js` dan identitas aset menjadi `20260819-16.18` untuk memutus cache lama.

## v16.16 — REF/SURAT sebagai pengirim PN Batam

- Menjadikan REF/SURAT setiap baris sebagai `origin_data_customer_name` khusus template Pengadilan Negeri Batam.
- Membatalkan ekspor PN Batam apabila ada REF/SURAT kosong.
- Mempertahankan sumber pengirim dari template/pengaturan awal untuk semua template lainnya.
- Mempertahankan tabel tanpa kolom Pengirim serta seluruh guard koreksi wajib v16.15.
- Mengganti bundle AI menjadi `ai-pdf-v16-16.js` dan identitas aset menjadi `20260816-16.16` untuk memutus cache lama.

## v16.15 — Koreksi wajib dan pengirim dari pengaturan awal

- Menghapus Pengirim dari tabel Periksa hasil dan selalu memakai nilai pengirim dari template atau pengaturan awal saat ekspor.
- Menghapus pemetaan pengirim pengganti dari impor spreadsheet.
- Mendeteksi `PERLU DICEK` walaupun menempel pada angka/huruf atau tidak memakai spasi.
- Mengunci ekspor memakai status koreksi pada data internal sehingga penanda tidak dapat lolos hanya karena tampilan tidak memperbarui hitungan.
- Mewajibkan alamat luar Kota Batam benar-benar diubah dan divalidasi sebagai wilayah Batam sebelum dapat disimpan; baris tujuan luar Batam tetap dapat dihapus.
- Mengganti bundle AI menjadi `ai-pdf-v16-15.js` dan identitas aset menjadi `20260816-16.15` untuk memutus cache lama.

## v16.14 — Scan-first dan Periksa hasil yang lebih ringkas

- Memperlakukan semua PDF sebagai hasil scan CamScanner dan melewati pembacaan text layer PDF sepenuhnya.
- Mempertahankan render gambar 1900 px pada pass pertama serta audit selektif hingga 2600 px untuk halaman yang hilang, ganda, atau meragukan.
- Mempertahankan Gemini 3.7 Flash serta default **15 halaman × 5 jalur**.
- Memindahkan Alamat tepat ke kanan Nama Penerima pada tabel Periksa hasil.
- Menyembunyikan Kode Pos dari tabel dan mengisinya otomatis melalui angka yang terbaca atau pemetaan alamat dua tingkat.
- Menyembunyikan Berat dan PxLxT untuk jenis kiriman Dokumen, sambil mempertahankan nilai baku ekspor 0,2 kg dan 10 × 10 × 10 cm.
- Mengganti bundle AI menjadi `ai-pdf-v16-14.js` dan identitas aset menjadi `20260816-16.14` untuk memutus cache lama.

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

## v16.18 — Optimasi Prompt dan Efisiensi Token Gemini 3.7 Flash
- Merapikan dan memadatkan instruksi di `buildPrompt` dan `buildVerificationPrompt` agar lebih langsung pada tujuan.
- Mengimplementasikan `response_format: { type: "json_object" }` di API body untuk memastikan model ringan seperti Gemini 3.7 Flash mengembalikan format JSON yang valid.
- Menekan token output AI dengan membuang whitespace dan markdown tak relevan dari *system instruction*.
- Bundle AI memakai nama baru `ai-pdf-v16-18.js` dan identitas versi Cloudflare dinaikkan ke `20260819-16.18`.

## Update v16.18.1
- Mengubah prompt AI pada `ai-pdf-v16-18.js` agar AI lebih agresif menangkap kode referensi/resi/surat ke dalam kolom `nomor_surat`.
- Memperketat filter instruksi AI untuk membuang kombinasi angka dan huruf panjang secara acak yang sebelumnya salah terdeteksi sebagai nama penerima.

## Update v16.18.2
- Mengupdate instruksi pada AI agar proaktif menangkap `PERIHAL SURAT` (subject) di dalam kolom `nomor_surat` (tidak hanya berupa angka/nomor).
