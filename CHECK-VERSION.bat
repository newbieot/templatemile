@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "FAIL=0"

echo Memeriksa mile.posnew.com Secure Gateway v16.2...

findstr /c:"20260802-16.2" "_worker.js" >nul && echo [OK] Worker v16.2 || (echo [GAGAL] Worker bukan v16.2 & set "FAIL=1")
findstr /c:"serverSideGate: true" "_worker.js" >nul && echo [OK] Gate sisi server aktif || (echo [GAGAL] Gate sisi server tidak ditemukan & set "FAIL=1")
findstr /c:"FIREBASE_WEB_API_KEY" "_worker.js" >nul && echo [OK] Firebase key dibaca dari Cloudflare Secret || (echo [GAGAL] Binding Firebase tidak ditemukan & set "FAIL=1")
findstr /c:"MILE_SESSION_SECRET" "_worker.js" >nul && echo [OK] Session HMAC server aktif || (echo [GAGAL] Session secret tidak ditemukan & set "FAIL=1")
findstr /c:"Masuk ke workspace" "index.html" >nul && echo [OK] Halaman login tersedia || (echo [GAGAL] Halaman login tidak ditemukan & set "FAIL=1")
findstr /c:"Pengaturan transaksi" "app.html" >nul && echo [OK] HTML inti dipisahkan dari login || (echo [GAGAL] app.html tidak ditemukan & set "FAIL=1")
findstr /c:"ai-pdf-v16.js" "app.html" >nul && echo [OK] AI PDF v16 dimuat || (echo [GAGAL] AI PDF v16 tidak dimuat & set "FAIL=1")

if exist "assets\js\firebase-auth-v16.js" (
  echo [GAGAL] File Firebase client lama masih ada
  set "FAIL=1"
) else echo [OK] File Firebase client lama sudah dihapus

findstr /s /i /m /c:"AIza" *.html *.js *.md *.json *.xml 2>nul >nul
if not errorlevel 1 (
  echo [GAGAL] Ada Google API key tertanam di file repository
  set "FAIL=1"
) else echo [OK] Tidak ada Google API key tertanam

findstr /s /i /m /c:"BEGIN PRIVATE KEY" *.html *.js *.md *.json *.xml 2>nul >nul
if not errorlevel 1 (
  echo [GAGAL] Ada private key tertanam di file repository
  set "FAIL=1"
) else echo [OK] Tidak ada private key tertanam

if "%FAIL%"=="1" exit /b 1
echo Semua pemeriksaan dasar lulus.
exit /b 0
