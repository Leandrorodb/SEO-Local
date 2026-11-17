# Publicar no GitHub existente: SEO-Local

1. Extraia este ZIP inteiro (nao execute arquivos dentro do ZIP).
2. Abra a pasta `local-rank-tracker` extraida.
3. Execute `PUBLICAR_LOCAL_RANK_TRACKER_GITHUB.cmd`.
4. O script confirma que voce esta na conta `Leandrorodb` e que o repositorio `SEO-Local` e privado.
5. Autorize escrevendo `PUBLICAR` quando solicitado.
6. Veja o resultado em https://github.com/Leandrorodb/SEO-Local.
7. No Google AI Studio Build: **New app -> + -> Import from GitHub** -> escolha `SEO-Local`.

Necessita Git for Windows https://git-scm.com/download/win e GitHub CLI https://cli.github.com/.

**Privacidade:** estes arquivos incluem dados legados de empresas (ex.: `legacy/data/jares-*.json`). Confirme a autorizacao para transferir ao GitHub e AI Studio; dados de clientes nao devem ser expostos em repositorios publicos. `.env` nao deve ser commitado. O repositorio deve continuar privado.

**O que isto faz:** publica o codigo-fonte. Nao executa build, nao ativa banco, nao implanta nem garante funcionamento do preview; essa e a fase seguinte no AI Studio.
