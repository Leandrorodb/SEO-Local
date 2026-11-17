# Etapa 1 — fundação e fluxo de backend

30/10/2026. Entregues apps/api (Fastify/Auth/RBAC/owner/analytics), apps/worker (fila persistente, leases, scheduler), packages/db (3 migrations/RLS), contracts/domain/rank-providers, infra (PostgreSQL local/bootstrap), tests. Arquivos exatos no commit desta etapa via `git show --stat`.

Executado: `pnpm typecheck` aprovado; `pnpm test` **12/12**; `pnpm test:legacy` **13/13**. Integração em PostgreSQL nativo 18.1 com papel lrt_app sem superuser/BYPASSRLS. JWT RS256 validado por chave de teste, issuer e audience. Testes incluem memberships, MFA, ACL por ficha, RLS/FK, suspensão/reativação, idempotência de cobrança/tarefa, aprovação e bytes PDF.

Fluxo backend sintético: cadastro → resolver de teste → termos/revisão/ativação → 25 tarefas → worker → medições imutáveis → aprovação → PDF. Nenhuma consulta externa de ranking ou migração de clientes executada.

Correções durante validação: extensão pgcrypto desnecessária removida; fechamento SQL da função de orçamento; escape do ':' literal em rotas Fastify; lock de orçamento via advisory lock sem permitir editar provider_settings; canonicalização de datas para hash de JSONB.

Pendente real: OIDC/MFA de conta real, fornecedor autorizado/adapter e retenção contratual, gateway (manual implementado), Cloud Run/Tasks/Storage, backup restaurado, frontend/E2E. Não apto a produção comercial.
