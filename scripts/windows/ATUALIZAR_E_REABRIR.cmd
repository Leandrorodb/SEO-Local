@echo off
setlocal
cd /d "%~dp0..\..\"
title Local Rank Tracker - Atualizar e reabrir
if not exist "%~dp0..\..\package.json" (
  echo ERRO: o atualizador precisa ficar junto ao package.json.
  pause
  exit /b 1
)
echo.
echo Encerrando apenas os servicos registrados nesta instalacao...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\..\infra\encerrar-local.ps1"
if errorlevel 1 (
  echo Nao foi possivel encerrar todos os servicos. Nao atualize com a versao antiga aberta.
  pause
  exit /b 1
)
echo.
echo Compilando a versao desta pasta e iniciando novamente...
call "%~dp0ABRIR_LOCAL_RANK_TRACKER.cmd"
endlocal
