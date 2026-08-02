@echo off
setlocal
set "REPO=C:\Users\Ikhsan Radiansyah\Documents\GitHub\templatemile"
echo Memeriksa MILE Firebase Auth v16...
findstr /c:"firebase-auth-v16.js" "%REPO%\index.html" >nul && echo [OK] Login Firebase v16 dimuat || echo [GAGAL] Login Firebase v16 belum dimuat
findstr /c:"ai-pdf-v16.js" "%REPO%\index.html" >nul && echo [OK] AI PDF v16 dimuat || echo [GAGAL] AI PDF v16 belum dimuat
findstr /c:"20260802-16" "%REPO%\_worker.js" >nul && echo [OK] Worker v16 || echo [GAGAL] Worker belum v16
findstr /c:"accounts:lookup" "%REPO%\_worker.js" >nul && echo [OK] Verifikasi token Firebase aktif || echo [GAGAL] Verifikasi Firebase belum aktif
findstr /c:"ikhsan@posnew.com" "%REPO%\_worker.js" >nul && echo [OK] Email admin terdaftar || echo [GAGAL] Email admin belum terdaftar
pause
