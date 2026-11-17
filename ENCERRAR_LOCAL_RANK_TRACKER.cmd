@echo off
setlocal
cd /d "%~dp0"
title Local Rank Tracker - Encerrar
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\encerrar-local.ps1"
echo.
pause
endlocal
