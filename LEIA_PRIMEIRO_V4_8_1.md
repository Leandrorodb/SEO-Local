# Local Rank Tracker V4.8.1 — Hotfix de compilação

**Correção:** a V4.8 parava durante `pnpm build` com erro TS2339 em `tests/trusted-measurement.test.ts:10`, porque `maskLegacyBrowserRank` retornava o tipo genérico `T` embora o objeto produzido para posições antigas inclua `legacy_unverified: true`.

O tipo de retorno agora declara `T & { legacy_unverified?: true }`. **Não foi alterado o comportamento da medição nem a regra de bloquear posições antigas não verificadas.**

## Aplicar sem perder dados

Se você já instalou V4.8, use o ZIP separado `LOCAL_RANK_TRACKER_V4_8_1_HOTFIX_BUILD.zip`: copie os arquivos dele para a raiz atual do projeto (onde fica `package.json`) e execute `CORRIGIR_BUILD_E_ABRIR.cmd`. O script faz backup do arquivo alterado, copia a versão corrigida e abre o sistema. **Não apague `.env`, `work/` ou o banco PostgreSQL.**

Se preferir instalar em uma pasta nova, esta versão completa já inclui a alteração. Não misture duas instalações em execução.

## Escopo da validação

A correção foi verificada com o compilador TypeScript 5.8.3 instalado neste ambiente, verificando o retorno tipado, e com teste de execução da função. O `pnpm build` integrado e a medição real no Chrome do Windows não foram executados aqui; precisam passar na sua instalação antes de considerar a entrega homologada.
