# LOCAL RANK TRACKER 4.3 — WINDOWS (HOMOLOGACAO LOCAL)

Este pacote contem o codigo-fonte do SaaS e um iniciador que **instala as dependencias,
compila frontend + API + worker e so entao abre o sistema**. A primeira execucao
precisa de Node.js 22+, pnpm 11 e conexao com o registro de pacotes.

## Para abrir

1. Extraia o ZIP numa pasta NOVA. Nao copie os arquivos em cima de outra versao.
2. Entre na pasta `local-rank-tracker`.
3. Clique duas vezes em **ABRIR_LOCAL_RANK_TRACKER.cmd**.
4. Quando o navegador abrir, use `http://127.0.0.1:5173/`.
5. Para sair, clique em **ENCERRAR_LOCAL_RANK_TRACKER.cmd**.

Nao sera preciso digitar comandos de `pnpm` ou um codigo de seis digitos.
O iniciador cria uma identidade local exclusiva de homologacao e um ambiente de trabalho
no banco PostgreSQL. As credenciais e dados permanecem em `work/`, fora do pacote.

## Fluxo principal

`Empresas e unidades` -> colar URL do Google Maps -> `Buscar dados da ficha` ->
conferir nome, endereco e identificador -> salvar e confirmar ->
`Termos e clusters` -> `Gerar termos automaticamente` -> revisar -> importar ->
`Aprovar e ativar` -> `Nova auditoria` -> `Ponto unico` ->
`Calcular consultas e custo` -> `Confirmar e medir agora` -> `Resultados`.

A descoberta pelo Chrome pode ser inconclusiva. Nao invente coordenadas e nao
meça sem identidade confiavel da ficha. Se o Google exigir consentimento ou bloquear
o navegador, as consultas poderao falhar. O software NAO dribla verificacoes.

## O que foi testado na preparacao

- Testes legados do coletor e parsers: 13 aprovados.
- Testes independentes de OIDC/PKCE local: 2 aprovados.
- Testes de sugestoes automaticas de palavras-chave: 6 aprovados.
- Arquivos TS/TSX: verificados sintaticamente via transpiler TypeScript.
- Tests do iniciador/release: foram adicionados como verificacoes automatizadas.

Nao foi possivel baixar dependencias do registro npm neste ambiente de preparacao.
Por isso, **nao foi executado aqui um build integrado nem uma auditoria real no seu Chrome**.
O iniciador executa `pnpm build` no seu Windows e interrompe em caso de erro.

## Nao confunda homologacao com producao

A entrada automatica e somente via loopback e NAO substitui MFA de producao. O
motor Chrome e experimental; nao constitui uma fonte comercial licenciada de Google
Maps. SaaS em nuvem, pagamento automatico, confiabilidade dos dados e direitos de
coleta/retencao precisam de homologacao e implantacao separadas.

## Se o iniciador acusar erro

Na raiz do projeto, os logs de cada servico ficam em `work/iniciador/`.
NAO envie: `.env`, arquivos de `work/local-oidc`, `work/local-db` ou chaves.

## Sobre seus dados antigos

Este pacote novo NAO move ou sobrescreve bancos das versoes anteriores. Para migrar
historico de uma instalacao antiga, sera necessario um procedimento especifico e
backup verificado; jamais misture as pastas `work/` de duas versoes.
