@echo off
setlocal
cd /d "%~dp0"
rem Reutiliza o Node portatil ja instalado neste workspace, quando disponivel.
set "LRT_NODE_DIR=%~dp0..\..\work\node24\node-v24.22.3-win-x64"
if exist "%LRT_NODE_DIR%\node.exe" set "PATH=%LRT_NODE_DIR%;%PATH%"
echo SEO-Local: mantenha esta janela aberta enquanto quiser medir.
echo Se ja houver um coletor ativo, esta segunda instancia sera recusada.
call npm.cmd run collector:local
if errorlevel 1 (
  echo Nao foi possivel manter o coletor ativo. Confira a mensagem acima.
  pause
)
endlocal
