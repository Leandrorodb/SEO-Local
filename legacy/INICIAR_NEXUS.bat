@echo off
setlocal
cd /d "%~dp0"
title Nexus Local Rank Tracker
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js nao encontrado. Instale o Node 22 ou superior em https://nodejs.org/
 pause
 exit /b 1
)
if not exist node_modules\playwright (
 echo Instalando dependencias gratuitas na primeira execucao...
 call npm install --no-audit --no-fund
 if errorlevel 1 (pause & exit /b 1)
)
start "" http://127.0.0.1:4177
node src\server.js
pause
