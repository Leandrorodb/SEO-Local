# Operação e recuperação

## Serviços

API e frontend compilados: `node dist/apps/api/main.js`. Worker contínuo: `node dist/apps/worker/main.js`. Para Cloud Run sob demanda, usar o serviço HTTP separado `node dist/apps/worker/server.js` com audiência, emissor, JWKS HTTPS e sujeito próprios. Invocar `POST /internal/tick` com corpo vazio ou `POST /internal/audit-task` com apenas taskId. O worker busca tenant e escopo no banco. O tick processa no máximo 25 tarefas; medir tempo máximo e configurar periodicidade e concorrência conforme a quota.

A API e o worker recebem só o papel lrt_app, sem propriedade de tabelas nem BYPASSRLS. Não entregar a URL administrativa aos serviços. Executar migrations em job separado: `node dist/packages/db/migrate.js`. Registrar um proprietário verificado pelo script de bootstrap, fora da API. Manter o provedor disabled; qualquer adaptador comercial requer contrato, desenvolvimento e teste próprios.

## Homologação e promoção

Os workflows são arquivos entregues, **não implantações realizadas**. O release é manual, limitado ao ramo main, começa pelos testes completos e só avança para produção após homologação. O mesmo commit é compilado em cada ambiente porque o frontend contém o client ID público daquele ambiente. Registrar o digest em cada promoção.

Pré-requisitos: dois ambientes GitHub com revisores e restrição de branch, contas de deploy federadas por ambiente, repositório Artifact Registry, serviços Cloud Run API e worker, job de migração, conexões privadas com Cloud SQL. O job e os serviços devem existir previamente com entrypoints e secrets distintos. Configurar capacidade máxima, TLS, região e rede. Ingress público somente onde necessário; worker privado com IAM e validação OIDC da aplicação. Não usar chaves JSON no repositório.

Configuração de ambiente: GCP_PROJECT, GCP_REGION, ARTIFACT_IMAGE, API_SERVICE, WORKER_SERVICE, MIGRATION_JOB, WEB_ORIGIN, VITE_OIDC_AUTHORITY, VITE_OIDC_CLIENT_ID, WIF_PROVIDER e DEPLOY_SERVICE_ACCOUNT. CLOUD_PROMOTION_ENABLED precisa ser true para habilitar a promoção. A variável protegida REAL_AUDIT_SIGNOFF_SHA só deve receber o commit efetivamente validado com fonte licenciada. Na entrega ela não foi configurada. O smoke público testa saúde e a recusa de acesso anônimo. O ensaio autenticado com contas reais continua obrigatório antes de promoção comercial.

O workflow preserva as configurações dos recursos existentes e atualiza a imagem. O worker deve iniciar com o entrypoint HTTP e o job com o de migração. Configurar invocação de Scheduler/Tasks fora da aplicação. Cada mudança exige backup, compatibilidade entre o schema e a versão anterior e registro das revisões anteriores. Referências de operação: [revisões Cloud Run](https://docs.cloud.google.com/run/docs/managing/revisions), [execução do job](https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/execute) e [identidade federada](https://github.com/google-github-actions/auth).

## Backup e rollback

- O teste automatizado faz cópia física **com PostgreSQL desligado** e restaura em outra porta com o mesmo binário. No Windows, pg_ctl encerra o banco normalmente antes da cópia. Nunca copiar um diretório de dados ativo como se fosse backup consistente. Proteger backups como dados de cliente.
- Para backup lógico disponibilizar pg_dump/pg_restore da versão compatível e configuração privada de MIGRATION_DATABASE_URL. Executar `node --env-file=.env --import tsx infra/backup-restore.ts backup work/backups/novo.dump`. O script recusa sobrescrever um dump existente. Não gravar senhas nos argumentos.
- Restaurar somente em um banco novo, isolado, com os papéis necessários (inclusive lrt_app), redirecionando MIGRATION_DATABASE_URL ao destino. Definir RESTORE_CONFIRMED_EMPTY_DATABASE com o nome exato desse destino e executar o mesmo script com `restore` e o caminho do dump. Ele rejeita objetos de usuário já existentes e usa transação única. A restauração lógica e a de Cloud SQL não foram ensaiadas aqui.
- Na nuvem, pausar novos jobs, voltar tráfego de API e worker às revisões anteriores, verificar saúde, negação anônima e acesso de duas organizações. Não reverter schema por exclusão de dados. Havendo incompatibilidade, restaurar backup/PITR em instância separada, comparar integridade e só então planejar o corte.
- Para incidente de custo: interromper novas compras no provedor/worker, preservar ledger e trilha, conferir reservas por task ID. UNCERTAIN significa que a cobrança pode ter ocorrido: não repetir automaticamente. Verificar prova do fornecedor antes de conciliar. Expiração de licença bloqueia operações mesmo entre ticks.
