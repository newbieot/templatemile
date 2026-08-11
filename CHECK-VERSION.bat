@echo off
setlocal
cd /d "%~dp0"
set "FAIL=0"

echo Memeriksa mile.posnew.com Secure Gateway v16.8...
echo.

findstr /c:"20260811-16.8" "_worker.js" >nul && echo [OK] Worker v16.8 || (echo [GAGAL] Worker bukan v16.8 & set "FAIL=1")
findstr /c:"v16.8 Secure Gateway" "index.html" >nul && echo [OK] Login v16.8 || (echo [GAGAL] Versi login tidak sesuai & set "FAIL=1")
findstr /c:"v16.8" "app.html" >nul && echo [OK] Workspace v16.8 || (echo [GAGAL] Versi workspace tidak sesuai & set "FAIL=1")

findstr /c:"10 halaman" "app.html" >nul && echo [OK] Opsi 10 halaman tersedia || (echo [GAGAL] Opsi 10 halaman tidak ditemukan & set "FAIL=1")
findstr /c:"selected>15 halaman" "app.html" >nul && echo [OK] Default 15 halaman || (echo [GAGAL] Default 15 halaman tidak ditemukan & set "FAIL=1")
findstr /c:"20 halaman" "app.html" >nul && echo [OK] Opsi 20 halaman tersedia || (echo [GAGAL] Opsi 20 halaman tidak ditemukan & set "FAIL=1")
findstr /c:"selected>5 jalur" "app.html" >nul && echo [OK] Default paralel 5 jalur || (echo [GAGAL] Default 5 jalur tidak ditemukan & set "FAIL=1")
findstr /c:"pagesPerRequest: 15, concurrency: 5" "assets\js\ai-pdf-v16.js" >nul && echo [OK] Preset Cepat 15 halaman x 5 jalur || (echo [GAGAL] Preset Cepat tidak sesuai & set "FAIL=1")
findstr /c:"Math.min(20" "assets\js\ai-pdf-v16.js" >nul && echo [OK] Batas halaman maksimum 20 || (echo [GAGAL] Batas halaman 20 tidak ditemukan & set "FAIL=1")
findstr /c:"Math.min(5" "assets\js\ai-pdf-v16.js" >nul && echo [OK] Batas concurrency maksimum 5 || (echo [GAGAL] Batas concurrency 5 tidak ditemukan & set "FAIL=1")
findstr /c:"mile-ai-config-v16-6" "assets\js\ai-pdf-v16.js" >nul && echo [OK] Storage key konfigurasi AI dipertahankan || (echo [GAGAL] Storage key konfigurasi AI dipertahankan tidak ditemukan & set "FAIL=1")
findstr /c:"JACCS_MPM" "app.html" >nul && echo [OK] Template JACCS MPM tersedia || (echo [GAGAL] Template JACCS MPM tidak ditemukan & set "FAIL=1")
findstr /c:"FINMPMJKT04120A" "assets\js\app-core.js" >nul && echo [OK] Customer code JACCS MPM || (echo [GAGAL] Customer code JACCS MPM tidak ditemukan & set "FAIL=1")
findstr /c:"PT JACCS MPM FINANCE INDONESIA" "assets\js\app-core.js" >nul && echo [OK] Nama pelanggan JACCS MPM || (echo [GAGAL] Nama pelanggan JACCS MPM tidak ditemukan & set "FAIL=1")
findstr /c:"868523" "assets\js\app-core.js" >nul && echo [OK] Sub service JACCS MPM || (echo [GAGAL] Sub service JACCS MPM tidak ditemukan & set "FAIL=1")

findstr /c:"MILE_SESSION_SECRET" "_worker.js" >nul && echo [OK] Session secret tetap aktif || (echo [GAGAL] Session secret hilang & set "FAIL=1")
findstr /c:"COSMOS_API_KEY" "_worker.js" >nul && echo [OK] Cosmos secret tetap aktif || (echo [GAGAL] Cosmos secret hilang & set "FAIL=1")
findstr /c:"/api/metrics/ai" "_worker.js" >nul && echo [OK] Statistik AI tetap aktif || (echo [GAGAL] Endpoint statistik hilang & set "FAIL=1")
findstr /c:"outsideBatam" "assets\js\ai-pdf-v16.js" >nul && echo [OK] Validasi luar Batam tetap aktif || (echo [GAGAL] Validasi luar Batam tidak ditemukan & set "FAIL=1")

findstr /c:"INDASTRADAI01294A" "assets\js\app-core.js" >nul && echo [OK] ID pelanggan ASTRA || (echo [GAGAL] ID pelanggan ASTRA tidak ditemukan & set "FAIL=1")
findstr /c:"INDTEMPO01294A" "assets\js\app-core.js" >nul && echo [OK] ID pelanggan INDTEMPO || (echo [GAGAL] ID pelanggan INDTEMPO tidak ditemukan & set "FAIL=1")
findstr /c:"915552" "assets\js\app-core.js" >nul && echo [OK] Tarif khusus Bank Syariah Negara || (echo [GAGAL] Tarif 915552 tidak ditemukan & set "FAIL=1")
findstr /c:"FATAL: ID Pelanggan kosong" "assets\js\app-core.js" >nul && echo [OK] Fatal guard customer_code || (echo [GAGAL] Fatal guard customer_code tidak ditemukan & set "FAIL=1")

echo.
if "%FAIL%"=="1" (
  echo HASIL: ADA PEMERIKSAAN YANG GAGAL.
  exit /b 1
)

echo HASIL: SEMUA PEMERIKSAAN LULUS.
exit /b 0

