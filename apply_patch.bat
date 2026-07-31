@echo off
setlocal
if "%~1"=="" (
  echo Penggunaan: apply_patch.bat "C:\path\ke\templatemile"
  exit /b 1
)
python "%~dp0apply_patch.py" "%~1"
if errorlevel 1 exit /b %errorlevel%
echo.
echo Selesai. Periksa repository target sebelum di-upload ke GitHub.
endlocal
