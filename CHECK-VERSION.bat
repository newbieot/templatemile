@echo off
setlocal
cd /d "%~dp0"
set "FAIL=0"

echo Memeriksa mile.posnew.com Secure Gateway v16.42...
echo.

findstr /c:"20260927-26.03-camera-primary-cta" "_worker.js" >nul && echo [OK] Worker camera primary CTA || (echo [GAGAL] Worker bukan versi camera primary CTA & set "FAIL=1")
findstr /c:"v16.42 Secure Gateway" "index.html" >nul && echo [OK] Login v16.42 || (echo [GAGAL] Versi login tidak sesuai & set "FAIL=1")
findstr /c:"v16.42" "app.html" >nul && echo [OK] Workspace v16.42 || (echo [GAGAL] Versi workspace tidak sesuai & set "FAIL=1")
findstr /r /c:"Gemini 3.8 Flash .* Default" "app.html" >nul && echo [OK] Gemini 3.8 Flash menjadi default || (echo [GAGAL] Default Gemini 3.8 Flash tidak ditemukan & set "FAIL=1")
findstr /c:"gemini-3.8-flash" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Gemini 3.8 diizinkan browser || (echo [GAGAL] Allowlist Gemini 3.8 browser tidak ditemukan & set "FAIL=1")
findstr /c:"gemini-3.8-flash" "_worker.js" >nul && echo [OK] Gemini 3.8 diizinkan gateway || (echo [GAGAL] Allowlist Gemini 3.8 gateway tidak ditemukan & set "FAIL=1")
findstr /c:"qwen-3.7-plus" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Qwen 3.7 Plus diizinkan browser || (echo [GAGAL] Qwen 3.7 Plus browser tidak ditemukan & set "FAIL=1")
findstr /c:"qwen-3.7-flash" "_worker.js" >nul && echo [OK] Qwen 3.7 Flash diizinkan gateway || (echo [GAGAL] Qwen 3.7 Flash gateway tidak ditemukan & set "FAIL=1")
findstr /c:"GEMINI_FALLBACK_CHAIN = Object.freeze([DEFAULT_MODEL, PRIMARY_FALLBACK_MODEL, SECONDARY_FALLBACK_MODEL])" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Fallback Gemini 3.8 ke 3.7 ke 3.6 aktif || (echo [GAGAL] Rantai fallback Gemini tidak ditemukan & set "FAIL=1")
findstr /c:"config.model !== GEMINI_38_MODEL" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Payload Gemini 3.8 bebas parameter sampling lama || (echo [GAGAL] Kompatibilitas payload Gemini 3.8 tidak ditemukan & set "FAIL=1")
findstr /c:"Gemini 3.6 Flash" "app.html" >nul && echo [OK] Gemini 3.6 tetap tersedia sebagai fallback || (echo [GAGAL] Fallback Gemini 3.6 tidak ditemukan & set "FAIL=1")

findstr /c:"10 halaman" "app.html" >nul && echo [OK] Opsi 10 halaman tersedia || (echo [GAGAL] Opsi 10 halaman tidak ditemukan & set "FAIL=1")
findstr /c:"selected>15 halaman" "app.html" >nul && echo [OK] Default 15 halaman || (echo [GAGAL] Default 15 halaman tidak ditemukan & set "FAIL=1")
findstr /c:"20 halaman" "app.html" >nul && echo [OK] Opsi 20 halaman tersedia || (echo [GAGAL] Opsi 20 halaman tidak ditemukan & set "FAIL=1")
findstr /c:"selected>5 jalur" "app.html" >nul && echo [OK] Default paralel 5 jalur || (echo [GAGAL] Default 5 jalur tidak ditemukan & set "FAIL=1")
findstr /c:"pagesPerRequest: 15, concurrency: 5" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Preset Cepat 15 halaman x 5 jalur || (echo [GAGAL] Preset Cepat tidak sesuai & set "FAIL=1")
findstr /c:"DEFAULT_NETWORK_MODE = 'normal'" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Profil normal menjadi default || (echo [GAGAL] Default profil normal tidak ditemukan & set "FAIL=1")
findstr /c:"Default aktif: 15 halaman" "app.html" >nul && echo [OK] UI menegaskan default 15 halaman x 5 jalur || (echo [GAGAL] Keterangan default 15 x 5 tidak ditemukan & set "FAIL=1")
findstr /c:"Math.min(20" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Batas halaman maksimum 20 || (echo [GAGAL] Batas halaman 20 tidak ditemukan & set "FAIL=1")
findstr /c:"Math.min(5" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Batas concurrency maksimum 5 || (echo [GAGAL] Batas concurrency 5 tidak ditemukan & set "FAIL=1")
findstr /c:"mile-ai-config-v16-19" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Konfigurasi lama tidak terbawa || (echo [GAGAL] Storage key konfigurasi baru tidak ditemukan & set "FAIL=1")
findstr /c:"aiNetworkMode" "app.html" >nul && echo [OK] Pilihan profil koneksi tersedia || (echo [GAGAL] Profil koneksi tidak ditemukan & set "FAIL=1")
findstr /c:"xhr.upload.onprogress" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Progres unggah aktual tersedia || (echo [GAGAL] Progres unggah aktual tidak ditemukan & set "FAIL=1")
findstr /c:"waitUntilOnline" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Pemulihan koneksi tersedia || (echo [GAGAL] Pemulihan koneksi tidak ditemukan & set "FAIL=1")
findstr /c:"HASIL SCAN" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Mode scan CamScanner aktif || (echo [GAGAL] Mode scan CamScanner tidak ditemukan & set "FAIL=1")
findstr /c:"verificationPages" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Audit halaman selektif aktif || (echo [GAGAL] Audit selektif tidak ditemukan & set "FAIL=1")
findstr /c:"mergeVerifiedRows" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Hasil audit selektif digabung aman || (echo [GAGAL] Penggabungan audit tidak ditemukan & set "FAIL=1")
findstr /c:"extractionTokenLimit" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Batas token dinamis aktif || (echo [GAGAL] Batas token dinamis tidak ditemukan & set "FAIL=1")
findstr /c:"buildJsonRepairBody" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Perbaikan JSON hemat retry aktif || (echo [GAGAL] Perbaikan JSON tidak ditemukan & set "FAIL=1")
findstr /c:"getTextContent" "assets\js\ai-pdf-v16-19.js" >nul
if not errorlevel 1 (echo [GAGAL] Pembacaan text layer masih aktif & set "FAIL=1") else (echo [OK] Text layer dilewati untuk semua scan)
findstr /c:"NAMA PENERIMA" "assets\js\app-core.js" >nul && echo [OK] Header Nama Penerima tersedia || (echo [GAGAL] Header Nama Penerima hilang & set "FAIL=1")
findstr /c:"is-document-review" "assets\js\app-core.js" >nul && echo [OK] Tabel Dokumen tanpa dimensi aktif || (echo [GAGAL] Mode tabel Dokumen tidak ditemukan & set "FAIL=1")
findstr /c:"resolveZipCode" "assets\js\app-core.js" >nul && echo [OK] Kode pos otomatis dua tingkat aktif || (echo [GAGAL] Kode pos otomatis tidak ditemukan & set "FAIL=1")
findstr /c:"1070PERLU DICEK47" "assets\js\app-core.js" >nul && echo [OK] PERLU DICEK yang menempel angka tetap dipaksa koreksi || (echo [GAGAL] Deteksi PERLU DICEK menempel belum aktif & set "FAIL=1")
findstr /c:"getPendingReviewCount()" "assets\js\app-core.js" >nul && echo [OK] Guard ekspor koreksi wajib memakai data internal || (echo [GAGAL] Guard koreksi wajib tidak ditemukan & set "FAIL=1")
findstr /c:"Alamat luar Kota Batam belum diperbaiki" "assets\js\app-core.js" >nul && echo [OK] Alamat luar Batam wajib diperbaiki || (echo [GAGAL] Koreksi wajib alamat luar Batam tidak ditemukan & set "FAIL=1")
findstr /c:"PENGIRIM</th>" "assets\js\app-core.js" >nul
if not errorlevel 1 (echo [GAGAL] Kolom Pengirim masih tampil di Periksa hasil & set "FAIL=1") else (echo [OK] Pengirim mengikuti pengaturan awal tanpa kolom review)
findstr /c:"val-senderName" "assets\js\app-core.js" "assets\js\ui.js" >nul
if not errorlevel 1 (echo [GAGAL] Input Pengirim per baris masih aktif & set "FAIL=1") else (echo [OK] Input Pengirim per baris sudah dihapus)
findstr /c:"mapSenderName" "app.html" "assets\js\app-core.js" >nul
if not errorlevel 1 (echo [GAGAL] Pemetaan pengirim pengganti masih aktif & set "FAIL=1") else (echo [OK] Pengirim sumber tidak dapat menimpa pengaturan awal)
findstr /c:"senderNameFinal = dNoSurat" "assets\js\app-core.js" >nul && echo [OK] PN Batam memakai REF/SURAT sebagai Nama Pengirim || (echo [GAGAL] Pengirim PN Batam tidak berasal dari REF/SURAT & set "FAIL=1")
findstr /c:"wajib diisi karena menjadi Nama Pengirim" "assets\js\app-core.js" >nul && echo [OK] REF/SURAT PN Batam wajib diisi || (echo [GAGAL] Guard REF/SURAT PN Batam tidak ditemukan & set "FAIL=1")
findstr /c:"FORBIDDEN_EXCEL_CHARACTER_PATTERN" "assets\js\app-core.js" "assets\js\beta-core.js" >nul && echo [OK] Sanitizer karakter Excel aktif di aplikasi utama dan beta || (echo [GAGAL] Sanitizer karakter Excel tidak lengkap & set "FAIL=1")
findstr /c:"worksheet masih memuat karakter terlarang" "assets\js\app-core.js" "assets\js\beta-core.js" >nul && echo [OK] Guard worksheet karakter terlarang aktif || (echo [GAGAL] Guard worksheet karakter terlarang tidak lengkap & set "FAIL=1")
if exist "assets\vendor\pdfjs\pdf.min.js" (echo [OK] PDF.js lokal tersedia) else (echo [GAGAL] PDF.js lokal tidak ditemukan & set "FAIL=1")
if exist "assets\vendor\pdfjs\pdf.worker.min.js" (echo [OK] PDF worker lokal tersedia) else (echo [GAGAL] PDF worker lokal tidak ditemukan & set "FAIL=1")
if exist "assets\vendor\sheetjs\xlsx.full.min.js" (echo [OK] SheetJS lokal tersedia) else (echo [GAGAL] SheetJS lokal tidak ditemukan & set "FAIL=1")
findstr /c:"FAHRUDIN 0028C20250400784" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Contoh kode alfanumerik pada nama ditangani || (echo [GAGAL] Guard kode alfanumerik nama tidak ditemukan & set "FAIL=1")
findstr /c:"Penagihan dan Peringatan Terakhir" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Perihal surat tersedia sebagai fallback || (echo [GAGAL] Aturan perihal surat tidak ditemukan & set "FAIL=1")
findstr /c:"3166/PAN.01.W32-U2/HK2.4/VII/2026" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Nomor surat resmi diprioritaskan dan dirapikan || (echo [GAGAL] Aturan nomor surat resmi tidak ditemukan & set "FAIL=1")
if exist "TEST-REPORT-v16.19.md" (echo [OK] Laporan uji v16.19 tersedia) else (echo [GAGAL] Laporan uji v16.19 hilang & set "FAIL=1")
findstr /c:"JACCS_MPM" "app.html" >nul && echo [OK] Template JACCS MPM tersedia || (echo [GAGAL] Template JACCS MPM tidak ditemukan & set "FAIL=1")
findstr /c:"FINMPMJKT04120A" "assets\js\app-core.js" >nul && echo [OK] Customer code JACCS MPM || (echo [GAGAL] Customer code JACCS MPM tidak ditemukan & set "FAIL=1")
findstr /c:"PT JACCS MPM FINANCE INDONESIA" "assets\js\app-core.js" >nul && echo [OK] Nama pelanggan JACCS MPM || (echo [GAGAL] Nama pelanggan JACCS MPM tidak ditemukan & set "FAIL=1")
findstr /c:"868523" "assets\js\app-core.js" >nul && echo [OK] Sub service JACCS MPM || (echo [GAGAL] Sub service JACCS MPM tidak ditemukan & set "FAIL=1")
findstr /c:"Ambil Foto di HP" "app.html" >nul && echo [OK] Kamera HP menjadi CTA utama || (echo [GAGAL] CTA kamera HP tidak ditemukan & set "FAIL=1")
findstr /c:"Coba versi Beta" "app.html" >nul
if not errorlevel 1 (echo [GAGAL] CTA Beta masih tampil di halaman utama & set "FAIL=1") else (echo [OK] CTA Beta sudah dihapus dari halaman utama)
findstr /c:"BANKBRI01294A" "assets\js\app-core.js" >nul && echo [OK] Template Bank BRI Nagoya || (echo [GAGAL] Template Bank BRI Nagoya tidak ditemukan & set "FAIL=1")
findstr /c:"FINFIF02294A" "assets\js\app-core.js" >nul && echo [OK] Template FIF Group || (echo [GAGAL] Template FIF Group tidak ditemukan & set "FAIL=1")
findstr /c:"FINMEGACENT02110B" "assets\js\app-core.js" >nul && echo [OK] Template Megacentral Finance || (echo [GAGAL] Template Megacentral Finance tidak ditemukan & set "FAIL=1")
findstr /c:"FINMUF02120A" "assets\js\app-core.js" >nul && echo [OK] Template Mandiri Utama Finance || (echo [GAGAL] Template Mandiri Utama Finance tidak ditemukan & set "FAIL=1")
findstr /c:"FINSEDAYA02294A" "assets\js\app-core.js" >nul && echo [OK] Template Astra Sedaya Finance || (echo [GAGAL] Template Astra Sedaya Finance tidak ditemukan & set "FAIL=1")
findstr /c:"KESRSGHBTAM01294A" "assets\js\app-core.js" >nul && echo [OK] Template RS Graha Hermine || (echo [GAGAL] Template RS Graha Hermine tidak ditemukan & set "FAIL=1")
findstr /c:"senderNameFromReference: true" "assets\js\app-core.js" >nul && echo [OK] Nama pengirim dari No Surat/No Ref || (echo [GAGAL] Aturan Nama Pengirim dari No Ref tidak ditemukan & set "FAIL=1")
findstr /c:"publishTariff" "assets\js\app-core.js" >nul && echo [OK] Tarif Publish dikunci kosong || (echo [GAGAL] Guard Tarif Publish tidak ditemukan & set "FAIL=1")
if exist "assets\js\template-picker.js" (echo [OK] Pencarian template pelanggan tersedia) else (echo [GAGAL] Pencarian template pelanggan tidak ditemukan & set "FAIL=1")
if exist "assets\css\template-picker.css" (echo [OK] UI mobile template pelanggan tersedia) else (echo [GAGAL] UI mobile template pelanggan tidak ditemukan & set "FAIL=1")

findstr /c:"MILE_SESSION_SECRET" "_worker.js" >nul && echo [OK] Session secret tetap aktif || (echo [GAGAL] Session secret hilang & set "FAIL=1")
findstr /c:"COSMOS_API_KEY" "_worker.js" >nul && echo [OK] Cosmos secret tetap aktif || (echo [GAGAL] Cosmos secret hilang & set "FAIL=1")
findstr /c:"/api/metrics/ai" "_worker.js" >nul && echo [OK] Statistik AI tetap aktif || (echo [GAGAL] Endpoint statistik hilang & set "FAIL=1")
findstr /c:"outsideBatam" "assets\js\ai-pdf-v16-19.js" >nul && echo [OK] Validasi luar Batam tetap aktif || (echo [GAGAL] Validasi luar Batam tidak ditemukan & set "FAIL=1")

if exist "assets\js\ai-pdf-v16-12.js" (echo [GAGAL] Bundle AI lama v16.12 masih ada & set "FAIL=1") else (echo [OK] Bundle AI lama v16.12 sudah dihapus)
if exist "assets\js\ai-pdf-v16-13.js" (echo [GAGAL] Bundle AI lama v16.13 masih ada & set "FAIL=1") else (echo [OK] Bundle AI lama v16.13 sudah dihapus)
if exist "assets\js\ai-pdf-v16-14.js" (echo [GAGAL] Bundle AI lama v16.14 masih ada & set "FAIL=1") else (echo [OK] Bundle AI lama v16.14 sudah dihapus)
if exist "assets\js\ai-pdf-v16-15.js" (echo [GAGAL] Bundle AI lama v16.15 masih ada & set "FAIL=1") else (echo [OK] Bundle AI lama v16.15 sudah dihapus)
if exist "assets\js\ai-pdf-v16-16.js" (echo [GAGAL] Bundle AI lama v16.16 masih ada & set "FAIL=1") else (echo [OK] Bundle AI lama v16.16 sudah dihapus)
if exist "assets\js\ai-pdf-v16-18.js" (echo [GAGAL] Bundle AI lama v16.18 masih ada & set "FAIL=1") else (echo [OK] Bundle AI lama v16.18 sudah dihapus)

findstr /c:"INDASTRADAI01294A" "assets\js\app-core.js" >nul && echo [OK] ID pelanggan ASTRA || (echo [GAGAL] ID pelanggan ASTRA tidak ditemukan & set "FAIL=1")
findstr /c:"FINBSN01294A" "assets\js\app-core.js" >nul && echo [OK] ID pelanggan BSN Batam || (echo [GAGAL] ID pelanggan FINBSN01294A tidak ditemukan & set "FAIL=1")
findstr /c:"BANK SYARIAH NASIONAL KC BATAM" "assets\js\app-core.js" >nul && echo [OK] Nama pelanggan BSN Batam || (echo [GAGAL] Nama pelanggan BSN Batam tidak ditemukan & set "FAIL=1")
findstr /c:"915616" "assets\js\app-core.js" >nul && echo [OK] Kode tarif BSN Batam || (echo [GAGAL] Kode tarif 915616 tidak ditemukan & set "FAIL=1")
findstr /c:"lockService: true" "assets\js\app-core.js" >nul && echo [OK] Kode layanan BSN dikunci || (echo [GAGAL] Penguncian kode layanan tidak ditemukan & set "FAIL=1")
findstr /c:"lockItemType: true" "assets\js\app-core.js" >nul && echo [OK] Jenis kiriman BSN dikunci || (echo [GAGAL] Penguncian jenis kiriman tidak ditemukan & set "FAIL=1")
findstr /c:"kolom customer_code pada worksheet kosong" "assets\js\app-core.js" >nul && echo [OK] Guard customer_code tingkat worksheet || (echo [GAGAL] Guard worksheet customer_code tidak ditemukan & set "FAIL=1")
findstr /c:"FATAL: ID Pelanggan kosong" "assets\js\app-core.js" >nul && echo [OK] Fatal guard customer_code || (echo [GAGAL] Fatal guard customer_code tidak ditemukan & set "FAIL=1")

findstr /c:"INDTEMPO01294A" "app.html" "assets\js\app-core.js" "assets\js\events-v16.js" >nul
if not errorlevel 1 (echo [GAGAL] Template INDTEMPO lama masih aktif & set "FAIL=1") else (echo [OK] Template INDTEMPO lama sudah dihapus)
findstr /c:"tempoBankSyariahTariff" "app.html" "assets\js\app-core.js" "assets\js\events-v16.js" >nul
if not errorlevel 1 (echo [GAGAL] Kontrol pertanyaan Bank Syariah lama masih aktif & set "FAIL=1") else (echo [OK] Pertanyaan Bank Syariah lama sudah dihapus)

findstr /c:"Cloudflare-CDN-Cache-Control: no-store" "_headers" >nul && echo [OK] HTML tidak dicache Cloudflare || (echo [GAGAL] Header no-store Cloudflare tidak ditemukan & set "FAIL=1")
findstr /c:"VERSIONED_ASSET_CACHE" "_worker.js" >nul && echo [OK] Cache aset berbasis versi aktif || (echo [GAGAL] Cache aset berbasis versi tidak ditemukan & set "FAIL=1")
findstr /c:"x-mile-app-version" "_worker.js" >nul && echo [OK] Header versi deployment aktif || (echo [GAGAL] Header versi deployment tidak ditemukan & set "FAIL=1")

if exist "camera.html" (echo [OK] Halaman mobile camera tersedia) else (echo [GAGAL] camera.html tidak ditemukan & set "FAIL=1")
findstr /c:"navigator.mediaDevices.getUserMedia" "assets\js\camera.js" >nul && echo [OK] Native browser camera API aktif || (echo [GAGAL] Browser camera API tidak ditemukan & set "FAIL=1")
findstr /c:"facingMode: { ideal: 'environment' }" "assets\js\camera.js" >nul && echo [OK] Kamera belakang menjadi default || (echo [GAGAL] Prioritas kamera belakang tidak ditemukan & set "FAIL=1")
findstr /c:"requestFullscreen" "assets\js\camera.js" >nul && echo [OK] Fullscreen camera aktif || (echo [GAGAL] Fullscreen camera tidak ditemukan & set "FAIL=1")
findstr /c:"finishCaptureButtonFullscreen" "camera.html" "assets\js\camera.js" >nul && echo [OK] Tombol Finish Capture fullscreen aktif || (echo [GAGAL] Tombol Finish Capture fullscreen tidak ditemukan & set "FAIL=1")
findstr /c:"playShutterSound" "assets\js\camera.js" >nul && echo [OK] Suara shutter capture aktif || (echo [GAGAL] Suara shutter tidak ditemukan & set "FAIL=1")
findstr /c:"cameraHudToast" "camera.html" "assets\js\camera.js" >nul && echo [OK] Notifikasi HUD capture aktif || (echo [GAGAL] Notifikasi HUD capture tidak ditemukan & set "FAIL=1")
findstr /c:"cameraFlash" "camera.html" "assets\js\camera.js" >nul && echo [OK] Animasi flash capture aktif || (echo [GAGAL] Animasi flash tidak ditemukan & set "FAIL=1")
findstr /c:"Start Capture Session" "camera.html" >nul
if not errorlevel 1 (echo [GAGAL] Tombol Start Capture Session masih tampil & set "FAIL=1") else (echo [OK] Open Camera langsung membuat sesi)
findstr /c:"Foto kurang jelas, silakan ulangi capture." "assets\js\camera.js" >nul
if not errorlevel 1 (echo [GAGAL] Validasi kualitas masih memblokir capture & set "FAIL=1") else (echo [OK] Resolusi dan kualitas tidak memblokir capture)
findstr /c:"orientationchange" "assets\js\camera.js" >nul && echo [OK] Perubahan orientasi kamera ditangani || (echo [GAGAL] Dukungan orientasi tidak ditemukan & set "FAIL=1")
findstr /c:"camera=(self)" "_worker.js" "_headers" >nul && echo [OK] Permission camera dibatasi ke halaman camera || (echo [GAGAL] Permission camera route tidak ditemukan & set "FAIL=1")
findstr /c:"url.pathname === '/camera'" "_worker.js" >nul && echo [OK] Route camera terlindungi tersedia || (echo [GAGAL] Route camera terlindungi tidak ditemukan & set "FAIL=1")
if exist "tests\camera-capture.test.js" (echo [OK] Tes camera capture tersedia) else (echo [GAGAL] Tes camera capture tidak ditemukan & set "FAIL=1")
if exist "tests\worker-camera-route.test.mjs" (echo [OK] Tes auth route camera tersedia) else (echo [GAGAL] Tes auth route camera tidak ditemukan & set "FAIL=1")
if exist "TEST-REPORT-v16.42.md" (echo [OK] Laporan uji mobile camera v16.42 tersedia) else (echo [GAGAL] Laporan uji v16.42 tidak ditemukan & set "FAIL=1")

echo.
if "%FAIL%"=="1" (
  echo HASIL: ADA PEMERIKSAAN YANG GAGAL.
  exit /b 1
)

echo HASIL: SEMUA PEMERIKSAAN LULUS.
exit /b 0
