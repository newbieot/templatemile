@echo off
setlocal
set "TARGET=C:\Users\Ikhsan Radiansyah\Documents\GitHub\templatemile"
echo Memeriksa repository lokal...
echo.
findstr /C:"Runtime Secret · v15" "%TARGET%\index.html" && echo [OK] index.html v15 || echo [GAGAL] index.html masih lama
findstr /C:"version: '20260802-14'" "%TARGET%\_worker.js" && echo [OK] worker v15 || echo [GAGAL] worker masih lama
findstr /C:"env.COSMOS_API_KEY" "%TARGET%\_worker.js" && echo [OK] Cloudflare Secret digunakan || echo [GAGAL] Cloudflare Secret belum digunakan
findstr /C:"aiApiKey" "%TARGET%\index.html" >nul && echo [GAGAL] Input API key masih ada || echo [OK] Input API key sudah hilang
pause
endlocal
