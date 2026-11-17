@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo  NEXUS AI STUDIO - PUBLICAR GITHUB PRIVADO
echo ==============================================
echo.
where git >nul 2>&1
if errorlevel 1 (
 echo ERRO: Git for Windows nao encontrado. Instale: https://git-scm.com/download/win
 goto :fim
)
where gh >nul 2>&1
if errorlevel 1 (
 echo ERRO: GitHub CLI nao encontrado. Instale: https://cli.github.com/
 echo Alternativa: siga ai-studio\GUIA_IMPORTACAO.md para publicar manualmente.
 goto :fim
)
echo Confira que a pasta nao contem segredos nem dados privados antes do envio.
choice /c SN /m "Deseja criar e publicar o repositorio PRIVADO na sua conta GitHub"
if errorlevel 2 goto :fim

gh auth status >nul 2>&1
if errorlevel 1 (
 echo Fazendo login no GitHub pelo navegador...
 gh auth login
 if errorlevel 1 goto :fim
)
if not exist .git (
 git init
 if errorlevel 1 goto :fim
)
git branch -M main
git add .
git diff --cached --quiet
if errorlevel 1 (
 git commit -m "Importar Nexus Local Rank Tracker para Google AI Studio"
 if errorlevel 1 (
  echo Falha no commit. Configure git config --global user.name e user.email.
  goto :fim
 )
)
echo.
echo Criando repo PRIVADO e enviando arquivos...
gh repo create nexus-local-rank-tracker --private --source=. --remote=origin --push
if errorlevel 1 (
 echo Nao foi possivel criar/enviar o repo. Talvez o nome ja exista.
 echo Use o guia para conectar um repo existente manualmente.
 goto :fim
)
echo.
echo PRONTO! Abra AI Studio Build, +, Import from GitHub e selecione nexus-local-rank-tracker.
echo Depois cole ai-studio\PROMPT_MIGRACAO_AI_STUDIO.md no chat do projeto importado.
:fim
echo.
pause
endlocal
