# Local Rank Tracker V3 — medição experimental local, sem API paga

Este pacote é um **patch sobre o V3 recebido**, não um sistema de produção pronto.
O adaptador `local_chrome_preview` reaproveita a ideia do medidor das Jares: Chrome visível, consultas sequenciais e identificação por CID. Não usa APIs pagas, proxies, CAPTCHA-bypass nem dados simulados para construir posições. **Não substitui uma licença comercial de dados.** Antes de usar qualquer automação no Google Maps, verifique se seu uso é permitido pelas condições aplicáveis.

## Pré-requisitos

- Projeto V3 configurado e acessível no PC, com login OIDC/MFA e banco PostgreSQL **local** já funcionando. Sem esse passo, a aplicação V3 continua exigindo configuração inicial.
- Node.js, pnpm e Google Chrome instalados. Pacotes instalados com `pnpm install --frozen-lockfile`.
- Ambiente de testes. **Não habilitar em Cloud Run ou produção.**

## Ativar

1. Faça backup do seu repositório e do PostgreSQL. Mescle o patch sobre sua versão (se o Codex fez alterações depois do ZIP, compare os diffs antes).
2. Na raiz do projeto, copie os três valores de `LOCAL_PREVIEW.env.example` para `.env`, preservando as demais configurações e os URLs locais do banco.
3. No PostgreSQL local já migrado, execute `pnpm preview:enable` (precisa da `MIGRATION_DATABASE_URL`). O script valida que a conexão administrativa é local.
4. Execute a API e o worker com esse mesmo `.env`: `pnpm api`, `pnpm worker`. Execute `pnpm dev` para a interface. **Não use NODE_ENV=production**.
5. No painel: adicione sua empresa por URL do Maps, revise o candidato retornado, confirme a identidade, insira os clusters e termos, configure a grade 5×5, faça a prévia e clique para medir.
6. Neste piloto, limite a **25 consultas por auditoria**, isto é, 1 palavra-chave em 25 pontos (ou outra configuração com no máximo 25 tarefas se disponível). Isso evita lançar 1.000 acessos sem validar o comportamento.
7. O Chrome abre visível no computador do worker. As capturas e JSONs individuais ficam em `work/local-chrome-evidence`. Revise os prints e o status antes de informar posições ao cliente.

## Restrições importantes

- Esse modo é estritamente experimental e local. Se faltar CID, coordenadas ou metadados confiáveis no link, a tela continuará exigindo conferência manual. Não dizemos que funciona com 100% dos links.
- Resultado `VERIFIED` significa correspondência por identificador da ficha e lista capturada na sessão, **não** prova de posição em toda a cidade nem de licença de dados.
- O navegador do Google Maps pode variar, impedir acesso, exibir anúncio, lista parcial ou abrir a ficha diretamente. Nesses casos, o sistema registra resultados inconclusivos; não cria 1º lugar fictício.
- O worker não roda em segundo plano quando o computador está desligado. Para automação verdadeiramente online 24h, é necessário hospedagem/workers e uma fonte adequada de resultados.
- O uso comercial em SaaS requer resolver as políticas e direitos de acesso e redistribuição das informações. Não use o adaptador experimental para vender medições.
- O custo de API deste adaptador é zero; computador, energia, internet e infraestrutura não são gratuitos.
- Não implementamos aqui login local sem OIDC, nem reescrevemos a interface do V3; esse patch conecta o worker e o resolver experimental à arquitetura existente.

## Arquivos alterados

- `packages/rank-providers/index.ts` — escolha segura do provedor experimental
- `packages/rank-providers/local-chrome-preview.ts` — coleta local, CID e evidência
- `packages/domain/audits.ts` — limite de consultas por execução local
- `apps/worker/main.ts` — encerramento do contexto Chrome
- `infra/enable-local-preview.ts` — ativação explícita no PostgreSQL local
- `package.json` — comando `preview:enable`

O coletor comercial permanece desabilitado. Nenhuma chave de API nem medição paga é necessária para este piloto.
