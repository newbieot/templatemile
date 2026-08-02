@echo off
setlocal
chcp 65001 >nul
set "SOURCE=%~dp0"
set "TARGET=C:\Users\Ikhsan Radiansyah\Documents\GitHub\templatemile"

echo ================================================
echo  INSTALL MILE SERVER SECRET v15 KE GITHUB
echo ================================================
echo.

if not exist "%SOURCE%index.html" (
  echo ERROR: index.html tidak ditemukan di folder installer.
  echo Ekstrak seluruh ZIP terlebih dahulu, lalu jalankan file ini.
  pause
  exit /b 1
)

if not exist "%TARGET%\.git" (
  echo ERROR: Folder repository atau .git tidak ditemukan:
  echo %TARGET%
  echo.
  echo Pastikan lokasi GitHub Desktop benar.
  pause
  exit /b 1
)

echo Sumber : %SOURCE%
echo Tujuan : %TARGET%
echo.
echo Menyalin dan menimpa seluruh file aplikasi...
robocopy "%SOURCE%" "%TARGET%" /E /IS /IT /R:2 /W:1 /XD ".git" /XF "INSTALL-KE-GITHUB.bat" "CHECK-VERSION.bat" >nul
set "RC=%ERRORLEVEL%"
if %RC% GEQ 8 (
  echo ERROR: Robocopy gagal dengan kode %RC%.
  pause
  exit /b %RC%
)

findstr /C:"Runtime Secret · v15" "%TARGET%\index.html" >nul
if errorlevel 1 (
  echo ERROR: Instalasi selesai tetapi penanda v15 tidak ditemukan.
  echo Jangan commit. Coba ekstrak ZIP ulang.
  pause
  exit /b 1
)

findstr /C:"input?.apiKey" "%TARGET%\_worker.js" >nul
if not errorlevel 1 (
  echo ERROR: _worker.js lama masih terdeteksi.
  pause
  exit /b 1
)

echo.
echo BERHASIL: Runtime Secret v15 sudah disalin ke repository.
echo.
echo Langkah berikutnya:
echo 1. Buka GitHub Desktop.
echo 2. Pastikan banyak file terlihat berubah.
echo 3. Commit to main.
echo 4. Push origin.
echo 5. Tunggu Cloudflare Deployment berstatus Success.
echo.
pause
endlocal
