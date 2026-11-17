@echo off
setlocal
cd /d "%~dp0"
title Nexus - Importar Medicoes
where node >nul 2>nul
if errorlevel 1 (echo Node.js 22 ou superior necessario. & pause & exit /b 1)
if "%~1"=="" (
  if not exist "resultado.zip" (
    echo Coloque resultado.zip nesta mesma pasta, ou arraste o ZIP sobre IMPORTAR_RESULTADO.bat
    pause
    exit /b 1
  )
  node scripts\import-result.js "resultado.zip"
) else (
  node scripts\import-result.js "%~1"
)
if errorlevel 1 (echo Confira o erro acima. & pause & exit /b 1)
echo.
echo Importacao encerrada. Abra INICIAR_NEXUS.bat para consultar.
pause
