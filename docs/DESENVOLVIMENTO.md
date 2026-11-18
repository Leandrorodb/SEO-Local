# Desenvolvimento e publicação

## Ambiente

Node.js 24.12+ e npm. Use `npm.cmd` no Windows quando a política do PowerShell bloquear `npm.ps1`. Java 21 é necessário para o emulador Firestore; Chrome para a coleta local.

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run test:legacy
npm.cmd run test:firebase
npm.cmd audit --omit=dev --audit-level=high
```

`test:firebase` inicia somente emuladores no projeto `demo-seo-local`. As capturas são fixtures explicitamente sintéticas. Esse teste verifica fluxo, isolamento, cancelamento e recuperação; a coleta real precisa de validação separada.

Para executar a API emulada, configure `GCLOUD_PROJECT=demo-seo-local`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` e `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` e use `npm run firebase:api`. Esse comando recusa iniciar sem os dois emuladores. As portas configuradas ficam em `firebase.spark.json`.

## Publicar o frontend

```powershell
npm.cmd run build:hosted
npx.cmd --yes firebase-tools@15.36.0 deploy --only hosting --config firebase.spark.json --project seo-local-64b17
```

`build:hosted` aponta para a origem HTTPS da API Render e desativa modos de demonstração. A identidade autenticada no Firebase CLI precisa estar autorizada no projeto. Não use `firebase.json` para este deploy gratuito: ele inclui a implantação alternativa de Functions, que exige faturamento. `firebase.review.json` é somente para revisão de interface.

## Publicar a API

Serviço existente Render Free: `seo-local-api-vh6q`, branch `desenvolvimento-gemini`.

- Build: `npm ci --include=dev && npm run typecheck && npm run build:render`
- Start: `node dist/render/server.js`
- Saúde: `/health`
- Configuração reproduzível: `render.yaml`

Mantenha credenciais no ambiente privado do serviço. Nunca copie seu conteúdo para Git, logs ou chat. A API não executa Chrome e não deve receber a chave privada do coletor.

O serviço foi criado a partir da URL pública do Git. Até agora, os pushes não iniciaram deploy automático, apesar da flag exibida pelo serviço. Confira a lista de deploys; se não houver um em andamento para o commit, publique manualmente. Não dispare um segundo deploy quando já houver um. Confirme o SHA e o estado LIVE, depois `/health` e o fluxo autenticado no site.

## Coletor local

```powershell
npm.cmd run collector:local
```

O launcher usa a identidade privada dedicada ao projeto e uma organização autorizada. No computador atual, a configuração fica no `work/` externo à cópia Git. Em outra máquina, forneça `FIREBASE_SERVICE_ACCOUNT` e `LRT_COLLECTOR_ORGANIZATION_ID` em ambiente privado. Não publique a chave.

O launcher recusa variáveis de emuladores e `DATABASE_URL`, para impedir mistura com Neon/PostgreSQL. O computador precisa ficar ligado. `Ctrl+C` encerra o coletor após a tarefa em andamento e marca a presença offline.

## Instalação PostgreSQL antiga

Os scripts em `scripts/windows/` preservam a instalação local anterior; não usam o banco Firebase. O `.env.example` da raiz é exclusivo desse legado. O script da raiz `ABRIR_LOCAL_RANK_TRACKER.cmd` abre o site publicado.

O Dockerfile em `infra/` também é da API PostgreSQL. Usa Node 24 e o mesmo `package-lock.json`. Não representa o backend Render atual.

## Git e verificações

`main` é a referência pública; `desenvolvimento-gemini` é a branch atualmente configurada no Render. Mantenha ambas no mesmo commit enquanto essa configuração persistir. CI verifica a suíte principal e a integração Firebase. Corrija falhas reais, sem desativar auditoria ou notificações globais para esconder avisos.
