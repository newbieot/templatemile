@echo off
setlocal
cd /d "%~dp0"
set "FAIL=0"

echo Memeriksa mile.posnew.com Secure Gateway v16.6...
echo.

findstr /c:"20260803-16.6" "_worker.js" >nul && echo [OK] Worker v16.6 || (echo [GAGAL] Worker bukan v16.6 & set "FAIL=1")
findstr /c:"v16.6 Secure Gateway" "index.html" >nul && echo [OK] Login v16.6 || (echo [GAGAL] Versi login tidak sesuai & set "FAIL=1")
findstr /c:"v16.6" "app.html" >nul && echo [OK] Workspace v16.6 || (echo [GAGAL] Versi workspace tidak sesuai & set "FAIL=1")

findstr /c:"10 halaman" "app.html" >nul && echo [OK] Opsi 10 halaman tersedia || (echo [GAGAL] Opsi 10 halaman tidak ditemukan & set "FAIL=1")
findstr /c:"selected>15 halaman" "app.html" >nul && echo [OK] Default 15 halaman || (echo [GAGAL] Default 15 halaman tidak ditemukan & set "FAIL=1")
findstr /c:"20 halaman" "app.html" >nul && echo [OK] Opsi 20 halaman tersedia || (echo [GAGAL] Opsi 20 halaman tidak ditemukan & set "FAIL=1")
findstr /c:"selected>5 jalur" "app.html" >nul && echo [OK] Default paralel 5 jalur || (echo [GAGAL] Default 5 jalur tidak ditemukan & set "FAIL=1")
findstr /c:"pagesPerRequest: 15, concurrency: 5" "assets\js\ai-pdf-v16.js" >nul && echo [OK] Preset Cepat 15 halaman x 5 jalur || (echo [GAGAL] Preset Cepat tidak sesuai & set "FAIL=1")
findstr /c:"Math.min(20" "assets\js\ai-pdf-v16.js" >nul && echo [OK] Batas halaman maksimum 20 || (echo [GAGAL] Batas halaman 20 tidak ditemukan & set "FAIL=1")
findstr /c:"Math.min(5" "assets\js\ai-pdf-v16.js" >nul && echo [OK] Batas concurrency maksimum 5 || (echo [GAGAL] Batas concurrency 5 tidak ditemukan & set "FAIL=1")
findstr /c:"mile-ai-config-v16-6" "assets\js\ai-pdf-v16.js" >nul && echo [OK] Storage key v16.6 || (echo [GAGAL] Storage key v16.6 tidak ditemukan & set "FAIL=1")

findstr /c:"MILE_SESSION_SECRET" "_worker.js" >nul && echo [OK] Session secret tetap aktif || (echo [GAGAL] Session secret hilang & set "FAIL=1")
findstr /c:"COSMOS_API_KEY" "_worker.js" >nul && echo [OK] Cosmos secret tetap aktif || (echo [GAGAL] Cosmos secret hilang & set "FAIL=1")
findstr /c:"/api/metrics/ai" "_worker.js" >nul && echo [OK] Statistik AI tetap aktif || (echo [GAGAL] Endpoint statistik hilang & set "FAIL=1")
findstr /c:"outsideBatam" "assets\js\ai-pdf-v16.js" >nul && echo [OK] Validasi luar Batam tetap aktif || (echo [GAGAL] Validasi luar Batam tidak ditemukan & set "FAIL=1")

echo.
if "%FAIL%"=="1" (
  echo HASIL: ADA PEMERIKSAAN YANG GAGAL.
  exit /b 1
)

echo HASIL: SEMUA PEMERIKSAAN LULUS.
exit /b 0
