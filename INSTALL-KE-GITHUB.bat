@echo off
setlocal EnableExtensions
set "SOURCE=%~dp0"
set "TARGET=%USERPROFILE%\Documents\GitHub\templatemile"

echo =====================================================
echo  mile.posnew.com Secure Gateway v16.12 - Installer
ECHO =====================================================
echo Sumber : %SOURCE%
echo Target : %TARGET%
echo.

if not exist "%TARGET%\.git" (
  echo [GAGAL] Folder target tidak ditemukan atau bukan repository Git.
  echo Pastikan repository berada di:
  echo %TARGET%
  pause
  exit /b 1
)

rem Hapus file Firebase client lama yang pernah memuat API key di repository.
del /q "%TARGET%\assets\js\firebase-auth-v16.js" 2>nul
del /q "%TARGET%\assets\js\ai-pdf-v15.js" 2>nul
del /q "%TARGET%\assets\js\ai-pdf.js" 2>nul
del /q "%TARGET%\assets\js\ai-pdf-v16.js" 2>nul
del /q "%TARGET%\assets\js\ai-pdf-v16-11.js" 2>nul

robocopy "%SOURCE%" "%TARGET%" /MIR /XD ".git" /XF "INSTALL-KE-GITHUB.bat" /R:2 /W:1 /NFL /NDL /NJH /NJS /NP
set "RC=%ERRORLEVEL%"
if %RC% GEQ 8 (
  echo [GAGAL] Penyalinan berhenti dengan kode Robocopy %RC%.
  pause
  exit /b %RC%
)

call "%TARGET%\CHECK-VERSION.bat"
if errorlevel 1 (
  echo.
  echo [GAGAL] Pemeriksaan versi tidak lulus. Jangan commit dahulu.
  pause
  exit /b 1
)

echo.
echo [BERHASIL] Secure Gateway v16.12 sudah dipasang ke repository lokal.
echo Berikutnya buka GitHub Desktop, periksa perubahan, Commit to main, lalu Push origin.
pause
