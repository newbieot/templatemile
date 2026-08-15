@echo off
setlocal
cd /d "%~dp0"
set "FAIL=0"

echo Memeriksa mile.posnew.com Secure Gateway v16.11...
echo.

findstr /c:"20260815-16.11" "_worker.js" >nul && echo [OK] Worker v16.11 || (echo [GAGAL] Worker bukan v16.11 & set "FAIL=1")
findstr /c:"v16.11 Secure Gateway" "index.html" >nul && echo [OK] Login v16.11 || (echo [GAGAL] Versi login tidak sesuai & set "FAIL=1")
findstr /c:"v16.11" "app.html" >nul && echo [OK] Workspace v16.11 || (echo [GAGAL] Versi workspace tidak sesuai & set "FAIL=1")
findstr /r /c:"Gemini 3.7 Flash .* Default" "app.html" >nul && echo [OK] Gemini 3.7 Flash menjadi default || (echo [GAGAL] Default Gemini 3.7 Flash tidak ditemukan & set "FAIL=1")
findstr /c:"gemini-3.7-flash" "assets\js\ai-pdf-v16-11.js" >nul && echo [OK] Gemini 3.7 diizinkan browser || (echo [GAGAL] Allowlist Gemini 3.7 browser tidak ditemukan & set "FAIL=1")
findstr /c:"gemini-3.7-flash" "_worker.js" >nul && echo [OK] Gemini 3.7 diizinkan gateway || (echo [GAGAL] Allowlist Gemini 3.7 gateway tidak ditemukan & set "FAIL=1")
findstr /c:"Gemini 3.6 Flash" "app.html" >nul && echo [OK] Gemini 3.6 tetap tersedia sebagai fallback || (echo [GAGAL] Fallback Gemini 3.6 tidak ditemukan & set "FAIL=1")

findstr /c:"10 halaman" "app.html" >nul && echo [OK] Opsi 10 halaman tersedia || (echo [GAGAL] Opsi 10 halaman tidak ditemukan & set "FAIL=1")
findstr /c:"selected>15 halaman" "app.html" >nul && echo [OK] Default 15 halaman || (echo [GAGAL] Default 15 halaman tidak ditemukan & set "FAIL=1")
findstr /c:"20 halaman" "app.html" >nul && echo [OK] Opsi 20 halaman tersedia || (echo [GAGAL] Opsi 20 halaman tidak ditemukan & set "FAIL=1")
findstr /c:"selected>5 jalur" "app.html" >nul && echo [OK] Default paralel 5 jalur || (echo [GAGAL] Default 5 jalur tidak ditemukan & set "FAIL=1")
findstr /c:"pagesPerRequest: 15, concurrency: 5" "assets\js\ai-pdf-v16-11.js" >nul && echo [OK] Preset Cepat 15 halaman x 5 jalur || (echo [GAGAL] Preset Cepat tidak sesuai & set "FAIL=1")
findstr /c:"Math.min(20" "assets\js\ai-pdf-v16-11.js" >nul && echo [OK] Batas halaman maksimum 20 || (echo [GAGAL] Batas halaman 20 tidak ditemukan & set "FAIL=1")
findstr /c:"Math.min(5" "assets\js\ai-pdf-v16-11.js" >nul && echo [OK] Batas concurrency maksimum 5 || (echo [GAGAL] Batas concurrency 5 tidak ditemukan & set "FAIL=1")
findstr /c:"mile-ai-config-v16-9" "assets\js\ai-pdf-v16-11.js" >nul && echo [OK] Konfigurasi AI v16.9 tetap kompatibel || (echo [GAGAL] Storage key konfigurasi AI tidak ditemukan & set "FAIL=1")
findstr /c:"aiNetworkMode" "app.html" >nul && echo [OK] Profil koneksi adaptif tersedia || (echo [GAGAL] Profil koneksi adaptif tidak ditemukan & set "FAIL=1")
findstr /c:"xhr.upload.onprogress" "assets\js\ai-pdf-v16-11.js" >nul && echo [OK] Progres unggah aktual tersedia || (echo [GAGAL] Progres unggah aktual tidak ditemukan & set "FAIL=1")
findstr /c:"waitUntilOnline" "assets\js\ai-pdf-v16-11.js" >nul && echo [OK] Pemulihan koneksi tersedia || (echo [GAGAL] Pemulihan koneksi tidak ditemukan & set "FAIL=1")
if exist "assets\vendor\pdfjs\pdf.min.js" (echo [OK] PDF.js lokal tersedia) else (echo [GAGAL] PDF.js lokal tidak ditemukan & set "FAIL=1")
if exist "assets\vendor\pdfjs\pdf.worker.min.js" (echo [OK] PDF worker lokal tersedia) else (echo [GAGAL] PDF worker lokal tidak ditemukan & set "FAIL=1")
if exist "assets\vendor\sheetjs\xlsx.full.min.js" (echo [OK] SheetJS lokal tersedia) else (echo [GAGAL] SheetJS lokal tidak ditemukan & set "FAIL=1")
findstr /c:"JACCS_MPM" "app.html" >nul && echo [OK] Template JACCS MPM tersedia || (echo [GAGAL] Template JACCS MPM tidak ditemukan & set "FAIL=1")
findstr /c:"FINMPMJKT04120A" "assets\js\app-core.js" >nul && echo [OK] Customer code JACCS MPM || (echo [GAGAL] Customer code JACCS MPM tidak ditemukan & set "FAIL=1")
findstr /c:"PT JACCS MPM FINANCE INDONESIA" "assets\js\app-core.js" >nul && echo [OK] Nama pelanggan JACCS MPM || (echo [GAGAL] Nama pelanggan JACCS MPM tidak ditemukan & set "FAIL=1")
findstr /c:"868523" "assets\js\app-core.js" >nul && echo [OK] Sub service JACCS MPM || (echo [GAGAL] Sub service JACCS MPM tidak ditemukan & set "FAIL=1")

findstr /c:"MILE_SESSION_SECRET" "_worker.js" >nul && echo [OK] Session secret tetap aktif || (echo [GAGAL] Session secret hilang & set "FAIL=1")
findstr /c:"COSMOS_API_KEY" "_worker.js" >nul && echo [OK] Cosmos secret tetap aktif || (echo [GAGAL] Cosmos secret hilang & set "FAIL=1")
findstr /c:"/api/metrics/ai" "_worker.js" >nul && echo [OK] Statistik AI tetap aktif || (echo [GAGAL] Endpoint statistik hilang & set "FAIL=1")
findstr /c:"outsideBatam" "assets\js\ai-pdf-v16-11.js" >nul && echo [OK] Validasi luar Batam tetap aktif || (echo [GAGAL] Validasi luar Batam tidak ditemukan & set "FAIL=1")

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

echo.
if "%FAIL%"=="1" (
  echo HASIL: ADA PEMERIKSAAN YANG GAGAL.
  exit /b 1
)

echo HASIL: SEMUA PEMERIKSAAN LULUS.
exit /b 0
