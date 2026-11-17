# COMO ABRIR ESTE SISTEMA NO GOOGLE AI STUDIO BUILD — SEM PERDER O CÓDIGO

## Por que o ZIP não apareceu
O seu projeto React vazio (`src/App.tsx`, `src/main.tsx`, `src/index.css`) é um projeto separado. Arrastar ZIP/pasta no chat do AI Studio não equivale a instalar o projeto dentro de `/src`. O AI Studio não pode adivinhar automaticamente o conteúdo de arquivos que não foram montados.

## MÉTODO RECOMENDADO (OFICIAL): GitHub privado + Import from GitHub

1. Extraia o ZIP desta migração para uma pasta, por exemplo `C:\Projetos\NEXUS_AI_STUDIO_MIGRACAO`.
2. Instale/abra `Git for Windows` e GitHub CLI `gh` (opcional). Se possuir ambos, execute `PUBLICAR_GITHUB_PRIVADO.bat`. O script solicita login no seu GitHub pelo próprio CLI, cria um repositório **privado**, faz commit e push dos arquivos. Revise os arquivos antes de publicar. Nunca inclua `local-data`, credenciais, `resultado.zip`, prints ou arquivos de cliente no repositório.
3. SEM CLI: crie um repositório PRIVADO vazio no github.com, `nexus-local-rank-tracker`, e no terminal desta pasta rode:
   ```
   git init
   git add .
   git commit -m "Importar Nexus Local Rank Tracker v1.2"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/nexus-local-rank-tracker.git
   git push -u origin main
   ```
   (Para commits, configure seu user.name e user.email no git, se necessário.)
4. Abra **Google AI Studio → Build → + (Add files) → Import from GitHub** e selecione esse repositório. A importação cria um projeto AI Studio a partir do código real. Se o projeto React vazio atual não tiver suporte a substituir seu conteúdo por importação, crie um novo projeto a partir do repositório e continue a evolução por ele.
5. Abra `ai-studio/PROMPT_MIGRACAO_AI_STUDIO.md` e cole seu conteúdo no chat do projeto importado. Peça para EXECUTAR a migração, não apenas planejar.
6. Configure Firebase/Firestore e Auth caso queira dados persistidos na nuvem. Teste importação de resultados antes de usar medição automatizada como fonte de feedback.

Documentação oficial: https://ai.google.dev/gemini-api/docs/aistudio-build-mode

## SEM GITHUB (alternativa menos fiel)
Abra `ai-studio/FONTE_INTEGRAL_PARA_COLAR.txt`, copie o conteúdo e envie como TEXTO em mensagens divididas pelo marcador de arquivo, se o AI Studio aceitar o limite de contexto. Como há vários arquivos, colar o material em texto é menos confiável para restaurar o repositório; GitHub é a forma recomendada.

## Limitação muito importante da arquitetura
O serviço original usa SQLite local e Chrome Playwright VISÍVEL. O AI Studio Build executa o Node.js na nuvem; não terá acesso ao Chrome instalado no seu PC, e o disco do container não serve como banco durável. Por isso a migração orienta uma arquitetura híbrida: painel React/Node/Firestore na nuvem + coletor local Windows que envia/importa resultados. Não remova o coletor Windows enquanto o painel é adaptado.

## O que está dentro deste ZIP
- Código original completo v1.2 no diretório raiz.
- Matriz original de 160 termos/5 Jares em `data/`.
- `ai-studio/PROMPT_MIGRACAO_AI_STUDIO.md`: instrução técnica pronta para colar no AI Studio após a importação.
- `ai-studio/FONTE_INTEGRAL_PARA_COLAR.txt`: plano B para transferir texto sem GitHub.
- `.gitignore`: exclui banco, prints, resultados e segredos.
- `PUBLICAR_GITHUB_PRIVADO.bat`: facilita criação de repositório GitHub privado na sua própria conta, sem fornecer tokens neste chat.
