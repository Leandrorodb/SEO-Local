@echo off
setlocal
cd /d "%~dp0"
echo [Local Rank Tracker] Verificando build e testes locais...
call pnpm.cmd install --frozen-lockfile || goto error
call pnpm.cmd build || goto error
call pnpm.cmd test:legacy || goto error
call pnpm.cmd test || goto error
echo.
echo BUILD E TESTES PASSARAM. A COLETA REAL NO CHROME AINDA PRECISA SER VALIDADA.
pause
exit /b 0
:error
echo.
echo [FALHA] O projeto nao passou nesta etapa. Veja a primeira mensagem de erro.
pause
exit /b 1
