# SEO-Local — migração Firebase em andamento

**17/11/2026:** interface hospedada para acompanhamento; backend Firebase e
medição real ainda não publicados. Leia o [estado atual](docs/FIREBASE_STATUS.md)
e o [prompt de continuidade](docs/PROMPT_CONTINUIDADE_ANTIGRAVITY.md).

Site: https://seo-local-64b17.web.app. A documentação abaixo descreve o legado.

# V4.7 — Correção de identificação Google Maps e cadastro assistido

**Instalação ou atualização no Windows:** leia [`LEIA_PRIMEIRO_V4_7.md`](LEIA_PRIMEIRO_V4_7.md). Para atualizar sobre a instalação anterior, copie os arquivos para a mesma pasta (preserve `work/` e `.env`) e execute `ATUALIZAR_E_REABRIR.cmd`.

A V4.7 corrige a aba `about:blank`, retira a navegação do escopo da transação PostgreSQL, apresenta diagnósticos e oferece cadastro local com dados conferidos pelo operador quando a página não fornece detalhes suficientes. Esse cadastro **não equivale a verificação independente pelo Google**. O motor Chrome permanece experimental e precisa ser validado no Windows. Consulte `RESULTADO_VALIDACAO_V4_7.txt`.

---

> **V4.4 — NOVO FLUXO NO PAINEL:** abra o menu **Medir empresa** para seguir cadastro → termos → auditoria → resultados em uma tela. Veja `ENTREGA_V4_4.md` para limitações e critérios de validação.

# LOCAL RANK TRACKER V4.3 — ABRA COM DOIS CLIQUES

**PARA USAR NO WINDOWS:** extraia esta pasta e clique duas vezes em
`ABRIR_LOCAL_RANK_TRACKER.cmd`. Ele prepara o ambiente, **executa o build real**,
inicia PostgreSQL, login local, API compilada, worker compilado e a interface
compilada em `http://127.0.0.1:5173/`. Ao fechar, use `ENCERRAR_LOCAL_RANK_TRACKER.cmd`.

**Leia [`LEIA_PRIMEIRO_V4_3.md`](LEIA_PRIMEIRO_V4_3.md)**. O texto abaixo é documentação
histórica da arquitetura e execução manual; não é necessário digitar os comandos
para abrir a versão local atual.

**Estado verificado:** testes nativos de autenticação, medidor legado, gerador
de termos e verificação do iniciador passaram. **Build completo e medição real
não foram executados neste ambiente sem acesso ao npm**. O iniciador só abre
a interface depois que o build passar no Windows.

---

# Local Rank Tracker

> **Piloto experimental gratuito (homologação local):** consulte [`COMECE_AQUI_WINDOWS.md`](COMECE_AQUI_WINDOWS.md). O motor comercial continua desabilitado por padrão.

SaaS de SEO local com React, Fastify e PostgreSQL. O motor comercial vem **desligado**: cadastrar uma ficha e preparar a grade não gera nem compra rankings. Na homologação, o fluxo completo usa um fornecedor sintético restrito aos testes. O legado original está em `legacy/`, fora do site público.

## Executar e verificar no Windows

Requisitos: Node.js 22.14 ou superior, pnpm 11.25.0, Google Chrome para o teste local de navegador. Em CI, instalar o Chromium do Playwright. Usar um diretório privado; nunca publicar o ZIP de desenvolvimento como site estático.

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
pnpm.cmd test:legacy
pnpm.cmd test
pnpm.cmd audit --prod
```

A suíte cria bancos PostgreSQL temporários em portas livres de loopback, inicia a API compilada em outra porta local e usa identidades e medições exclusivas de teste. A cópia restaurada e as evidências ficam em `work/`, fora do Git. O frontend não expõe código do servidor, scripts de migração ou os dados da pasta legacy.

## Abrir uma instância local

1. Na raiz, executar `pnpm.cmd db:local` e manter esse terminal aberto. Esse comando inicializa e migra o PostgreSQL local na porta 55432, sem clientes de exemplo.
2. Copiar `.env.example` para `.env`; substituir as duas URLs do banco pelas de `work/local-db/database.env`. Manter ambos os arquivos privados. Em produção, entregar somente DATABASE_URL à API/worker; a credencial de migração é exclusiva da rotina administrativa.
3. Configurar no IdP um cliente público OIDC com Authorization Code + PKCE, callback `http://localhost:5173/auth/callback` e MFA administrativo. Preencher issuer, JWKS HTTPS e audience; neste frontend a audiência do ID token é o client ID. Fornecer auth_time e amr ou ACR de MFA do IdP. Somente VITE_OIDC_AUTHORITY e VITE_OIDC_CLIENT_ID são configurações públicas; não usar prefixo VITE_ para segredo.
4. Informar OWNER_SUBJECT e OWNER_EMAIL do titular verificado e executar `pnpm.cmd owner:bootstrap`. Para banco externo vazio, executar antes `pnpm.cmd db:migrate` com credencial administrativa. Não executar bootstrap para identidades não verificadas.
5. Em terminais separados, executar `pnpm.cmd api`, `pnpm.cmd dev` e `pnpm.cmd worker`. Acessar **http://localhost:5173**. No console proprietário, cadastrar plano, usuários e organização; conferir limites e período pago antes de liberar o acesso. Não existe conta demo nem senha padrão.
6. Para servir o frontend compilado na própria API, configurar callback e WEB_ORIGIN para essa origem e executar novamente o build depois de configurar o cliente OIDC. Ponto de entrada: `node --env-file=.env dist/apps/api/main.js`.

## Documentação

[Entrega, resultados e pendências](docs/ENTREGA.md) · [Operação e rollback](docs/OPERACAO.md) · [Auditoria do legado](docs/AUDIT-BASELINE.md) · [Especificação V3](docs/LOCAL_RANK_TRACKER_ESPECIFICACAO_V3.md) · [Decisões de arquitetura](docs/ADR-001.md) · [Etapa 1](docs/ETAPA-1.md) · [Etapa 2](docs/ETAPA-2.md) · [Contrato HTTP](docs/openapi.json).

As regras de suspensão, revisão e limite de consultas são verificadas no servidor. A entrada de termos é por colagem; o PDF e o texto para WhatsApp só são liberados após aprovação humana. Custos são expressos em milionésimos de dólar; valores de teste não são preços comerciais.
