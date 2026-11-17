@echo off
setlocal
cd /d "%~dp0"
title Local Rank Tracker - Iniciar
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\launcher-local.ps1"
if errorlevel 1 (
 echo.
 echo Falha ao iniciar. Envie uma foto desta janela ou consulte work\iniciador.
 pause
)
endlocal
