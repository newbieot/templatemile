@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -Command "$bytes = New-Object byte[] 48; $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($bytes); $rng.Dispose(); $secret = [Convert]::ToBase64String($bytes); Set-Clipboard -Value $secret; Write-Host ''; Write-Host 'MILE_SESSION_SECRET berhasil dibuat dan disalin ke clipboard:' -ForegroundColor Green; Write-Host $secret -ForegroundColor Cyan; Write-Host ''; Write-Host 'Tempel nilainya ke Cloudflare Variables and Secrets. Jangan simpan di GitHub.' -ForegroundColor Yellow"
echo.
pause
