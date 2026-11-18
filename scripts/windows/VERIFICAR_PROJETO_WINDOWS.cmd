@echo off
setlocal
cd /d "%~dp0..\..\"
echo [Local Rank Tracker] Verificando build e testes locais...
call npm.cmd ci || goto error
call npm.cmd run build || goto error
call npm.cmd run test:legacy || goto error
call npm.cmd run test || goto error
echo.
echo BUILD E TESTES PASSARAM. A COLETA REAL NO CHROME AINDA PRECISA SER VALIDADA.
pause
exit /b 0
:error
echo.
echo [FALHA] O projeto nao passou nesta etapa. Veja a primeira mensagem de erro.
pause
exit /b 1
