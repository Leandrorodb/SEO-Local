# LOCAL RANK TRACKER — Especificação de produto e arquitetura (v3.0)

**Data-base:** 30/10/2026  
**Status:** arquitetura aprovada em princípio; implementação e integrações externas ainda dependem de execução e validação.  
**Responsável pelo produto:** titular a formalizar contratualmente.  
**Marca pública:** **Local Rank Tracker**; nenhuma referência comercial à Nexus na interface, relatórios, URLs ou marca do produto.  
**Objetivo:** SaaS B2B multi-tenant para monitoramento automatizado de ranking local, inteligência SEO, relatórios, acompanhamento competitivo, gestão de licenças e operação de múltiplas fichas por organização.

> Documento de engenharia para orientar o Google AI Studio e agentes de programação. Não atesta que funcionalidades aqui descritas já estejam implementadas. Dados históricos de clientes só podem ser migrados com a devida autorização e verificação de titularidade.

## 1. Diagnóstico e decisões registradas

O protótipo legado v1.2 possui `src/server.js`, `src/db.js`, serviços `measurement`, `keywords`, `report`, `import`, frontend estático, SQLite e scripts locais Playwright. É útil como referência e para regressão, mas não é um SaaS apto a produção: não tem autenticação robusta, isolamento de tenants, assinaturas, operação contínua nem contrato seguro de provedor de ranking.

**Total do questionário:** 54 decisões; **41 SIM**, **3 NÃO**, **10 PENDENTES**.

**Sim, confirmados:**
- SaaS online B2B multi-tenant, muitas fichas por organização, assinatura mensal/anual e console exclusivo do proprietário.
- Cadastro por URL do Maps, resolução de identidade, colagem de termos produzidos no GPT, clusterização automática, deduplicação, biblioteca por nicho e recomendações sem IA paga.
- Auditoria automática após configuração, botão Medir agora, rotinas recorrentes, GeoGrid 5×5, superfícies Maps e pesquisa local separadas, comprovação de identidade/evidência antes de atribuir ranking.
- Histórico, concorrentes, alertas, Top 1/3/5/10, recomendações estratégicas e painel para redes de unidades.
- Feedback para WhatsApp, PDFs, relatórios com logotipo da agência, portal do cliente e aprovação humana para qualquer envio.
- Login individual, papéis, MFA de administradores, licença no servidor, suspensão por inadimplência, auditoria e operação/código privados.
- Tema escuro premium e claro, assistente de auditoria, homologação separada e funcionamento essencial sem créditos de IA.

**NÃO, confirmados:**
- D04: **não** exigir/importar termos via CSV/XLSX; entrada primária é colar texto/JSON gerado pelo GPT e edição manual em lote.
- S06: **não** oferecer carência comercial automática após vencimento.
- S07: **não** manter portal em modo leitura nem exportação self-service após suspensão contratual. **Ressalva obrigatória:** preservar dados, backups e canais administrativos para cumprimento de lei, contratos e requisições legítimas de acesso/portabilidade; essa decisão não autoriza retenção ilícita ou apagamento.

**PENDENTES (não devem ser alterados silenciosamente para SIM ou NÃO):**
- B05: teste grátis; B06: white-label completo.
- M04: oferecer 1 ponto como opção visível; M05: GeoGrid 3×3.
- M08: contratação de provedor profissional; M09: coletor Chrome legado como ferramenta auxiliar.
- A04: visualização de mapa de calor geográfico (diferente de **executar** 5×5, já aprovado).
- R03: exportação CSV/XLSX de medições pela UI.
- U03: nível de suporte mobile/tablet; U05: migração do histórico das cinco Jares.

**Decisões técnicas provisórias (não são voto do usuário):**
1. Para calcular uma posição geográfica, é necessário medir ao menos **um ponto** internamente. Não expor a opção M04 no catálogo antes da decisão; manter a medição central como baseline operacional de teste. GeoGrid 5×5 fica habilitável.
2. Manter a visualização do GeoGrid em formato de tabela simples enquanto A04 estiver pendente; persistir as coordenadas das 25 amostras.
3. Implementar `RankProvider` plugável e mensuração **desativada em produção** até contratar/autorizar uma fonte que permita o uso pretendido; nenhuma classificação real pode ser simulada silenciosamente.
4. UX desktop-first, CSS adaptável básico, sem promessa de experiência mobile completa até U03.
5. As Jares podem servir de testes técnicos com dados **sintéticos**. Dados reais só entram após U05 e autorização legítima de uso.

## 2. Escopo funcional e fluxos end-to-end

### F1 — Onboarding de organização
1. Proprietário cria `organization` e seu plano contratado; convida um `org_admin`.
2. Usuário autentica, verifica MFA se administrativo, seleciona a organização à qual pertence.
3. Backend verifica papel, associação ativa, status contratual e limites; todos os recursos herdam o tenant do contexto autenticado.
4. Organização pode ter marcas e várias fichas/unidades. O portal do cliente expõe apenas as unidades explicitamente autorizadas.

### F2 — Cadastro de ficha por link
1. Colar URL do Google Maps; parser seguro extrai identificadores permitidos e normaliza URL.
2. Resolver pelo provedor autorizado: nome comercial, endereço, localidade e identificadores (CID e/ou place ID se disponíveis e compatíveis com a licença).
3. Em caso de ambiguidade, mostrar candidatos e exigir confirmação; nunca fazer match apenas por nome parecido.
4. Após salvar, criar projeto inicial de termos e uma proposta de auditoria. A auditoria automática requer fonte habilitada, saldo, orçamento e consentimento/limites configurados.

### F3 — GPT → clusters → sistema
1. O operador pede ao GPT uma lista de termos e clusters a partir de informações **confirmadas** de produtos, serviços, cidade, bairro e busca comercial.
2. Recebe um payload em texto/JSON (contrato detalhado na seção 7) e cola no app; nada de CSV/XLSX.
3. Backend valida, normaliza acentos apenas para chave de deduplicação, preserva grafia, reconhece termos de marca, agrupa e identifica possíveis duplicatas.
4. Termos começam em `SUGGESTED` ou `VALIDATED` após revisão. Apenas `ACTIVE` entra na fila de medição.
5. Motor de sugestões por nicho pode propor termos sem IA, mas nunca afirmar que termos sugeridos são pesquisados ou que têm posição.

### F4 — Auditoria automática
1. Agendamento cria `audit_run` com snapshot de termos ativos, pontos geográficos, superfície, idioma e versão do algoritmo.
2. API executa pré-checagem transacional: licença ativa, plano, saldo/cota, permissão, provedor autorizado e orçamento disponível.
3. Criar tarefas com chaves idempotentes por run × termo × ponto × superfície; fila entrega a workers independentes.
4. Worker realiza consulta ao provedor habilitado, salva metadados de custo/proveniência e normaliza itens.
5. Identidade por CID/place ID estável, nunca apenas nome. Uma ocorrência ambígua fica em `REVIEW`, sem medalha.
6. Resultado validado gera `rank_measurement` imutável, atualiza agregados e produz eventos de mudança.
7. Falhas/timeout/não-localizado são estados distintos; não atribuir posição 100 ou 101 artificialmente.

### F5 — Inteligência de evolução
1. Comparar **mesmo termo + mesma superfície + mesmo ponto + mesmo idioma/dispositivo** entre runs comparáveis.
2. Gerar Top 1, Top 3, Top 5 e Top 10 acumulados, sem misturar consultas por marca com termos comerciais.
3. Concorrentes são observados no mesmo recorte geográfico e mesma captura, respeitando licença de retenção e exposição.
4. Gerar `opportunities` por regras determinísticas, com razões e limites; sugestões não são garantias de ranking.
5. Alertas configuráveis: novo primeiro lugar, queda material, queda repetida, falha de medição, próxima auditoria e consumo de orçamento.

### F6 — Feedback e PDF
1. Criar `report_draft` apenas com snapshots `VERIFIED` de medições concluídas e termos marcados como medidos.
2. Visualizar termos agrupados por posição (1º/2º/3º/Top 5 etc.), clusters, dados de localização e ressalvas metodológicas.
3. Revisor humano aprova (`DRAFT` → `IN_REVIEW` → `APPROVED`); antes disso não há envio automático.
4. Gerar texto para copiar no WhatsApp e PDF com marca da organização. White-label do software continua pendente.
5. Registrar hash, período, run IDs e versão do texto/PDF. Envios por mensageria somente com integração e consentimento específicos, fora do escopo inicial.

### F7 — Licença e suspensão
1. Organização adquire plano com limites de fichas, termos ativos, medições mensais e usuários.
2. Billing pode começar como cobrança manual registrada pelo proprietário; arquitetura suporta gateway com webhook verificado e reconciliado.
3. **Sem carência:** cessado o período contratualmente pago e confirmada inadimplência, backend altera `entitlement_status = SUSPENDED` e impede a operação da organização. Notificar conforme contrato; evitar bloqueio por erro transitório do gateway.
4. Não oferecer modo leitura/exportação self-service durante suspensão (respostas S06/S07). Dados permanecem preservados, com procedimento formal de acesso que cumpra lei/contrato.
5. Pagamento reconhecido reativa sem perda de histórico, com trilha imutável de quem, quando e por quê.

## 3. Matriz de módulos e prioridades

| Módulo | Capacidades | Prioridade | Aceitação objetiva |
|---|---|---|---|
| Plataforma & identidade | login, MFA, tenant switch, RBAC, isolamento | P0 bloqueante | acesso cruzado negado em API, storage e jobs |
| Billing & proprietário | console, planos, limites, suspensão no servidor, auditoria | P0 bloqueante | licença vencida bloqueia novos acessos/jobs mesmo com token antigo |
| Empresas/fichas | cadastro por URL, identidade, unidades, categorias e locais | P0 | CID/place ID reconciliado; nome não basta |
| Pesquisa & clusters | colar JSON/texto GPT, dedupe, revisão, biblioteca nichos | P0 | importação textual válida; não há CSV/XLSX |
| Rank provider & fila | consultas autorizadas, custos, idempotência, validação | P0 **gate de fonte** | sem provedor não há ranking de produção; com provedor mede e rastreia |
| Auditoria | nova/recorrente, 5×5, status, orçamento | P0 | histórico imutável por termo/ponto/superfície |
| Dashboard/histórico | Top 1/3/5/10, séries comparáveis e filtros | P1 | numeradores vêm só de VERIFIED |
| Concorrentes/alertas | liderança por recorte, variações, anomalias | P1 | origem da fonte e restrição de retenção explícitas |
| Feedback & PDF | revisão humana, mensagens, PDFs e marca da agência | P1 | sem envio sem APPROVED; dados sem inventar posição |
| Portal cliente | visão restrita de unidades atribuídas | P1 | não acessa outras organizações/unidades |
| Opportunity engine | score e tarefas SEO explicáveis | P1 | nenhuma afirmação de causalidade comprovada sem dados |
| 3×3 e heatmap | opções pendentes M05/A04 | P2 / adiado | ativar só após decisão |
| White-label, trial, importação histórica, export UI | opções pendentes | P2 / adiado | ativar só após decisão |

**P0** é base segura e auditável; **P1** é entrega comercial diferenciadora; **P2** depende de decisões adicionais. O frontend pode conter navegação e estados vazios para todos os módulos, mas não fingir que recursos futuros estão operacionais.

## 4. Arquitetura de referência

```text
Browser (React/TS + TanStack Query, Zod, Tailwind/shadcn)
    │ Firebase Auth/OIDC (ID token)
    ▼
Cloud Run: API Node.js/TS + Fastify
    ├── AuthN (token verificado) + AuthZ (tenant + RBAC + entitlement)
    ├── Fichas + Termos + Clusters + Runs + Relatórios
    ├── Owner Console + Billing/Webhooks + Audit logs
    ├── PostgreSQL (Cloud SQL) [RLS, migrations, backup]
    ├── Cloud Storage privado [PDFs/evidências autorizadas]
    └── Cloud Tasks ◄── Cloud Scheduler
              │
              ▼
Cloud Run Worker (conta de serviço restrita)
    ├── AuthN service-to-service + lease/idempotência
    ├── Budget/quota + RankProvider Adapter
    ├── DataForSEO Maps / Local Pack (SE contratado, uso permitido)
    └── normalização, snapshots, eventos, métricas
```

**Ambiente de desenvolvimento:** Google AI Studio Build pode gerar React+Node e guardar segredos no lado servidor. **Fonte de verdade:** repositório Git privado com histórico e revisão. **Produção:** Cloud Run + serviços externos configurados sob titularidade legítima, não o preview efêmero do AI Studio.

**Monorepo:** `apps/web`, `apps/api`, `apps/worker`, `packages/contracts`, `packages/domain`, `packages/db`, `packages/ui`, `packages/rank-providers`, `infra`, `tests`, `docs`. PNPM workspaces e TypeScript estrito. API versionada (`/v1`).

**Tecnologia recomendada:** React+TypeScript+Vite, React Router, Tailwind/shadcn, TanStack Query, Fastify+TypeScript+Zod, PostgreSQL+Drizzle, Firebase Auth (ou OIDC equivalente), Cloud Tasks+Cloud Scheduler, Cloud Storage, Cloud Run, OpenTelemetry/structured logs. Substituição de tecnologias somente mediante ADR documentada.

## 5. Modelo de dados — entidades e restrições

Todos os registros tenant-owned contêm `organization_id` (UUID). Chaves compostas/FKs garantem que filhos pertençam à mesma organização. `platform_owner` é escopo global e não é um papel autoatribuível.

| Entidade | Campos principais (além de `id`, timestamps) | Regras |
|---|---|---|
| `organizations` | `name`, `slug`, `status`, `billing_email` | slug único; tenant raiz |
| `users` | `auth_subject`, `email`, `mfa_state` | `auth_subject` único; sem privilégios implícitos |
| `organization_members` | `organization_id`, `user_id`, `role`, `status` | único por par org-usuário |
| `brands` | `organization_id`, `name`, `logo_object_key` | uma marca pode ter múltiplas fichas |
| `business_locations` | `organization_id`, `brand_id`, `name`, `maps_url`, `cid`, `place_id`, `address`, `geo_center`, `identity_status`, `source` | índice por `(organization_id,cid)` quando presente; identidade documentada |
| `keyword_clusters` | `organization_id`, `location_id`, `name`, `intent`, `origin` | sem duplicatas por local + slug |
| `keywords` | `organization_id`, `location_id`, `cluster_id`, `term`, `normalized_key`, `type`, `status`, `priority`, `source` | tipo BRAND/COMMERCIAL; dedupe por local + chave |
| `search_grids` | `organization_id`, `location_id`, `name`, `mode`, `center_lat`, `center_lng`, `spacing_m` | 25 pontos somente quando 5×5 |
| `grid_points` | `organization_id`, `grid_id`, `sequence`, `lat`, `lng` | imutáveis por versão do grid |
| `audit_schedules` | `organization_id`, `location_id`, `frequency`, `timezone`, `enabled`, `next_run_at` | alteração gera versão/auditoria |
| `audit_runs` | `organization_id`, `location_id`, `config_snapshot`, `status`, `started_at`, `ended_at`, `provider`, `estimated_cost`, `actual_cost` | configuração congelada antes de criar tarefas |
| `audit_tasks` | `organization_id`, `run_id`, `keyword_id`, `grid_point_id`, `surface`, `state`, `attempts`, `idempotency_key` | único por idempotency_key |
| `rank_measurements` | `organization_id`, `run_id`, `task_id`, `keyword_id`, `point_id`, `surface`, `observed_at`, `position`, `status`, `identity_match`, `result_depth`, `provider`, `provider_task_ref`, `brand_term`, `confidence`, `cost` | `position` apenas VERIFIED; registro imutável |
| `rank_competitor_observations` | `organization_id`, `measurement_id`, `competitor_external_id`, `position`, `source` | campos/TTL conforme contrato de dados |
| `evidence_objects` | `organization_id`, `measurement_id`, `object_key`, `sha256`, `license_tag`, `retention_until`, `kind` | acesso privado, signed URL curta; não pressupor print disponível |
| `rank_alerts` | `organization_id`, `location_id`, `keyword_id`, `kind`, `rule_version`, `status` | comparação apenas com recortes equivalentes |
| `opportunities` | `organization_id`, `location_id`, `keyword_id`, `score`, `reason_codes`, `state` | explicável, sem promessas |
| `report_drafts` | `organization_id`, `location_id`, `run_refs`, `content_json`, `state`, `approved_by`, `pdf_key`, `hash` | só medições VERIFIED; aprovação humana |
| `plans` | `code`, `max_locations`, `max_keywords`, `max_monthly_queries`, `max_users`, `features_json` | valores server-side |
| `subscriptions` | `organization_id`, `plan_id`, `billing_status`, `entitlement_status`, `paid_through`, `provider_ref`, `version` | estado separado de cobrança vs acesso |
| `subscription_events` | `organization_id`, `provider_event_id`, `type`, `recorded_at`, `payload_hash` | único por provedor/evento |
| `usage_ledger` | `organization_id`, `billing_period`, `run_id`, `task_id`, `units`, `cost`, `provider` | medição/consumo auditável; evita cobrança dupla |
| `audit_logs` | `organization_id?`, `actor`, `action`, `resource_type`, `resource_id`, `trace_id`, `redacted_metadata` | append-only, inclusive owner ações |
| `legal_data_requests` | `organization_id`, `requestor`, `request_type`, `status`, `fulfilled_at` | canal administrativo mesmo em suspensão |

**Invariantes de banco:**
- `CHECK(position IS NULL OR (status='VERIFIED' AND position>=1))`.
- Uma coleta `NO_MATCH_WITHIN_DEPTH` significa somente “não encontrado nos N resultados observados”, nunca ausência absoluta.
- Histórico não sofre `UPDATE` para reescrever posições; correção = nova revisão com vínculo e justificativa.
- FKs reforçam tenant por `(organization_id, resource_id)`; RLS como defesa adicional, com testes de policy por tenant.
- Índices em `(organization_id, location_id)`, `(keyword_id,point_id,surface,observed_at DESC)` e `audit_tasks(idempotency_key)`.
- Relação `organization_members` limita usuários à organização; `client_viewer` pode ter ACL por `location_id`.

## 6. Contrato de medição e nomenclatura

**Superfícies distintas:** `MAPS`, `LOCAL_PACK`, `LOCAL_FINDER`. Só habilitar uma superfície se a origem a suportar com documentação. Não equiparar resultado de Places API ordenado por relevância/distância com posição orgânica observada da interface Maps.

**Status:**
- `VERIFIED`: identidade estável correspondeu e posição está disponível.
- `REVIEW`: match por texto ou dados inconsistentes; posição candidata não entra no ranking.
- `NO_MATCH_WITHIN_DEPTH`: lista válida de N resultados analisados; empresa não identificada.
- `PARTIAL_RESULTS`: consulta retornou conjunto incompleto/limitado.
- `BLOCKED`, `ERROR`, `PROVIDER_UNAVAILABLE`, `UNSUPPORTED_SURFACE`.

**Metadados obrigatórios:** termo exato, organização, ficha, idioma, superfície, dispositivo, coordenadas / localização, provedor, hora UTC, profundidade, versão do parseador, ID da tarefa e status. Se houver prova licenciada, guardar referência/hash; **não inferir que API de ranking disponibiliza print**.

**Política de alertas:** rank de 2º para 5º só conta como queda comparável se mesmos parâmetros; marca comercial é filtro separado, não soma de conquistas comerciais.

## 7. Contratos de API (REST /v1) e schemas

### Padrões transversais
- `Authorization: Bearer <OIDC ID token>` verificado por backend; `X-Organization-Id` apenas seleciona **entre memberships autorizadas**. Não confiar em `organization_id` do body.
- `Idempotency-Key` exigido para mutações que geram jobs, licença e cobranças.
- Resposta padronizada: `{ "data": ..., "meta": { "requestId": "..." } }`.
- Erro: `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`.
- `401` não autenticado, `403` sem permissão, `402`/`403` entitlement insuficiente conforme convenção, `409` duplicata/conflito, `422` entrada inválida, `429` limite de consumo, `503` fonte indisponível.
- Todas as rotas com autenticação, role, tenant, plano, quota e validação server-side, conforme operação.

| Método e rota | Papel mínimo | Descrição |
|---|---|---|
| `GET /v1/me/organizations` | autenticado | memberships autorizadas |
| `POST /v1/organizations` | platform_owner | provisionamento; nunca autoatribuição |
| `GET /v1/organizations/:orgId/summary` | org_member | cards, posições, falhas e consumo |
| `POST /v1/locations/resolve` | analyst | pré-visualizar Maps URL e candidatos confiáveis |
| `POST /v1/locations` | org_admin/analyst | salvar ficha após confirmação |
| `GET /v1/locations?cursor=` | org_member | listar fichas escopadas |
| `POST /v1/locations/:id/keywords:paste` | analyst | colar texto/JSON; validar/dedupe/clusters |
| `POST /v1/locations/:id/keywords:suggest` | analyst | sugestões determinísticas por nicho |
| `PATCH /v1/keywords/:id` | analyst | validar/ativar/desativar termo |
| `POST /v1/locations/:id/grids` | analyst | grid 5×5 e baseline técnico |
| `POST /v1/locations/:id/audits` | analyst | criar medição com pré-orçamento e idempotência |
| `GET /v1/audits/:id` | org_member | progresso, custos, falhas e status |
| `GET /v1/locations/:id/rankings?surface=&period=` | org_member | agregados e histórico comparável |
| `GET /v1/locations/:id/competitors` | org_member | concorrência respeitando licença da fonte |
| `GET /v1/locations/:id/opportunities` | org_member | ações priorizadas |
| `POST /v1/locations/:id/reports` | analyst | snapshot e minuta, sem envio |
| `POST /v1/reports/:id/approve` | org_admin | aprovação humana |
| `GET /v1/reports/:id/pdf` | org_member autorizado | URL assinada restrita |
| `POST /v1/audit-schedules` | org_admin | agenda recorrente |
| `GET /v1/usage` | org_admin | consumo/limites/orçamento |
| `GET /v1/platform/organizations` | platform_owner | console comercial |
| `PATCH /v1/platform/organizations/:id/license` | platform_owner | suspender/reativar com motivo, audit log |
| `POST /v1/webhooks/billing` | assinatura de provedor | evento validado, idempotente |
| `POST /internal/audit-task` | identidade do worker | job assinado service-to-service |
| `POST /v1/legal/data-requests` | canal autorizado | pedido formal de dados mesmo se suspenso |

### Payload do GPT para colar

```json
{
  "schemaVersion": "1.0",
  "locationRef": "ID-da-ficha-no-LRT",
  "language": "pt-BR",
  "clusters": [
    {
      "name": "Loja de móveis",
      "intent": "commercial",
      "terms": [
        { "keyword": "loja de móveis em Lavras", "priority": "high", "kind": "commercial" },
        { "keyword": "móveis em Lavras", "priority": "high", "kind": "commercial" }
      ]
    },
    {
      "name": "Marca",
      "intent": "navigational",
      "terms": [
        { "keyword": "Jares Móveis Lavras", "priority": "low", "kind": "brand" }
      ]
    }
  ]
}
```

Rejeitar `locationRef` de outra organização; normalizar termos por chave de deduplicação; guardar fonte GPT como `user_pasted`, não como ranking medido. Validar formato JSON e oferecer parser de texto simples com prévia. Não confiar em instruções embutidas no conteúdo colado.

### `POST /v1/locations/:id/audits` — exemplo de requisição

```json
{
  "surface": "MAPS",
  "gridId": "uuid-do-grid-5x5",
  "keywordSelection": "ACTIVE",
  "device": "desktop",
  "language": "pt-BR",
  "maxProviderBudgetUsdMicros": 15000000,
  "dryRun": false
}
```

**Resposta assíncrona `202`:**

```json
{
  "data": {
    "runId": "uuid-da-auditoria",
    "status": "QUEUED",
    "keywordCount": 40,
    "gridPoints": 25,
    "plannedTasks": 1000,
    "budgetReservedUsdMicros": 15000000,
    "provider": "DATAFORSEO",
    "surface": "MAPS"
  },
  "meta": { "requestId": "uuid-de-trace" }
}
```

Valores monetários do provedor são contabilizados em **micros de USD** (inteiros); cobrança ao cliente em BRL é tratada separadamente e guarda moeda e câmbio da conciliação. A API deve recusar (`409/422/503`) se não há provedor ativo/aprovado ou faltar preço estimado, e (`402/429`) se custo exceder limites. `dryRun=true` calcula e retorna plano sem gastar consulta.

### `GET /v1/audits/:id` — resultado resumido

```json
{
  "data": {
    "runId": "uuid-da-auditoria",
    "status": "COMPLETED_WITH_WARNINGS",
    "totals": { "tasks": 1000, "verified": 752, "review": 12, "noMatchWithinDepth": 210, "errors": 26 },
    "actualProviderCostUsdMicros": 9820000,
    "finishedAt": "2026-10-30T18:00:00Z"
  },
  "meta": { "requestId": "uuid-de-trace" }
}
```

**Todos os valores do exemplo acima são demonstrativos do contrato de API; não representam medições reais.**

### Interface interna de provedor

```ts
// O contrato é a fronteira entre o núcleo SaaS e fornecedores licenciados.
type Surface = 'MAPS' | 'LOCAL_PACK' | 'LOCAL_FINDER';
type NormalizedRank = {
  observedAt: string;
  status: 'VERIFIED' | 'REVIEW' | 'NO_MATCH_WITHIN_DEPTH' | 'PARTIAL_RESULTS' | 'ERROR';
  position: number | null;
  candidatePosition?: number;
  matchingExternalId?: string;
  observedDepth: number;
  providerTaskRef: string;
  providerCostUsd: string;
  rawEvidenceRef?: string; // só se permitido contratualmente
};
interface RankProvider {
  supports(surface: Surface): boolean;
  quote(query: RankQuery): Promise<{ costUsd: string; maxDepth: number }>;
  measure(query: RankQuery): Promise<NormalizedRank>;
}
```

Por segurança e escalabilidade, o serviço de medição não é chamado diretamente do navegador: somente o worker com segredo do provedor e limites autorizados pode consultar.

## 8. Padrão de UX e telas

**Navegação principal:** Visão geral, Empresas e Unidades, Termos e Clusters, Nova Auditoria, Resultados, Concorrentes, Oportunidades, Feedbacks e Relatórios, Automação, Equipe, Faturamento; Console Proprietário visível apenas ao dono da plataforma.

**Assistente Nova Auditoria (imagem aprovada pelo usuário como referência estética):**
1. Link do Maps → confirmar ficha e cidade.
2. Colar termos GPT ou selecionar biblioteca; pré-visualizar clusters e duplicatas.
3. Configurar superfície, 5×5, termos ativos, periodicidade e custo previsto.
4. Prévia de consultas (= termos × pontos × superfícies) e orçamento estimado.
5. Confirmar, disparar, acompanhar estados (fila/medindo/concluído/com revisão/falha).
6. Ver resultados e preparar feedback para aprovação.

Tema default dark premium, opção light, hierarquia clara, contrastes, carregamento real, skeletons e estados vazios. Não renderizar gráficos fictícios sem selo Demo em homologação. `U03` responsividade completa segue pendente, com layout seguro para telas estreitas como base de desenvolvimento.

## 9. Segurança, custos e conformidade — gates

### Autorização
- Login individual com provedor confiável; MFA mandatória para platform_owner e org_admin; passos de risco sensíveis exigem reautenticação recente.
- Toda requisição valida `tenant membership`, papel, entitlement e escopo de unidade; recursos compartilhados verificam pai+filho. Nunca confiar em IDs, preços, cargos, status ou licenças enviados do frontend.
- RLS adicional no PostgreSQL; manter o escopo de tenant em cada job e storage. Não emitir links públicos duradouros de PDFs.
- Validação SSRF para URLs Maps; tamanho/encoding de payload, rate limits, CORS, CSP, segredos no Secret Manager, trilha imutável de operações administrativas.
- `platform_owner` não é impedido de administrar tenant suspenso; ações administrativas permanecem auditadas.

### Licenças sem carência
- `billing_status` e `entitlement_status` separados. Expiração de `paid_through` e confirmação de situação contratual disparam suspensão imediata **no limite temporal acordado**, não no primeiro webhook de falha transitória.
- Ao suspender, negar novas medições, agendamentos, edições, relatórios e acesso normal ao portal; jobs ainda não iniciados são cancelados/recusados. Um job em andamento deve revalidar entitlement antes da compra/consumo e antes do próximo lote.
- Sem portal de leitura/exportação após suspensão conforme resposta S07. Manter canal externo seguro e auditado para pedidos legalmente exigíveis, eventual rescisão, restituição dos dados e retenção ajustada contratualmente. Requer avaliação jurídica antes de lançar.
- Suspensão não deleta dados, não altera relatórios e não destrói histórico. Reativação é reversível.

### Custos de coleta
- Estimar antes de criar as tarefas: `consulta_planejada = termos_ativos × pontos × superfícies`.
- Reservar orçamento e verificar cota mensal por organização de forma atômica; `usage_ledger` reconcilia custo real, evita cobranças repetidas e libera reservas não utilizadas.
- Limite global diário/mensal e por tenant; parada segura quando ultrapassado; alertas internos 50/80/95%.
- Cloud Scheduler e Cloud Tasks podem entregar repetidamente; chaves idempotentes e transações protegem contra duplicidade.

### Licenças de dados de terceiros
- O Google Maps Platform proíbe formas de scraping/cópia e limita retenção e redistribuição do conteúdo. Não vender coletor Playwright como serviço de extração comercial sem revisão de direitos. A API oficial de Business Profile Performance oferece termos e impressões mensais mediante OAuth/autorização, **mas não posição no Maps**.
- DataForSEO possui endpoint Google Maps SERP com `keyword`, `language_code`, `location_coordinate` e campos como `cid`. É **candidato de fornecedor**, não aprovado pela resposta M08. Validar termos de redistribuição, retenção e uso comercial antes da integração de produção. Evitar screenshots capturados de fontes sem direito de armazenar.

## 10. Plano de implementação no Google AI Studio

### Gate 0 — propriedade do produto e dados
- Confirmar titularidade e licença de desenvolvimento (especialmente se trabalho for realizado durante vínculo com empresa cliente).
- Definir contrato, matriz controlador/operador, direito de tratamento dos dados e provedor licenciado para ranking.
- Proteger GitHub privado, Cloud Project, segredos e propriedade de domínio sob controle legítimo do titular.

### Entrega 1 — fundação SaaS (P0)
- Migrar monorepo React/Node/TS; renomear todos os componentes públicos para Local Rank Tracker.
- Implementar Auth, MFA, RBAC, tenants, migrations, RLS, owner console, plano/licença manual, logs, CI e homologação.
- Testes de acesso cruzado, suspensão e reativação antes de importar dados reais.

### Entrega 2 — empresas e inteligência de termos (P0)
- Implementar resolver de URL/identificador seguro, cadastro por unidades, marca/rede, colar JSON/texto GPT, clusterização, biblioteca nichos, dedupe, revisão/ativação.
- Testes de contaminação entre unidades com nomes parecidos e de isolamento por organização.

### Entrega 3 — motor e processamento (P0; dependente de M08)
- Criar contrato `RankProvider`, driver de teste fake **apenas em homologação** e integração real apenas após fonte licenciada.
- Configurar Cloud Tasks/Worker/Scheduler, 5×5, medição Maps/local distinta, quota/custos, idempotência, correlação de tarefas, observabilidade e status verificáveis.
- Teste real de pequena escala em fonte contratada; comparar com consultas manuais, registrar divergências sem ocultar.

### Entrega 4 — análises, feedbacks e portal (P1)
- Dashboards, histórico comparável, concorrentes, alertas, oportunidade/ação, PDFs com marca da organização, revisão humana e portal com ACL por unidade.
- Testes de snapshots e ausência de falsos 1º lugares, inclusive consultas por marca.

### Entrega 5 — produção e expansão
- Deploy em Cloud Run, backups + restauração testada, monitoramento, limites financeiros, política de incidentes, domínio, consentimentos e onboarding de clientes.
- Ativar pendências apenas mediante confirmação (trial, white-label, export UI, 3×3, mapa de calor, mobile completo, migração real das Jares).

**Critérios de bloqueio para release:** sem fonte de ranking autorizada não vender "medição automática" como recurso pronto; sem testes de isolamento e licenças não colocar clientes no mesmo ambiente; sem backup restaurável não faturar com dados críticos; sem prova `VERIFIED` não gerar medalha.

## 11. Plano de testes / definição de pronto

1. A org A não consegue ler/gravar/gerar relatório sobre org B, inclusive via acesso direto a URL e tasks forjadas.
2. A unidade A de uma marca não recebe as medições da unidade B por nome semelhante ou CID distinto.
3. MFA bloqueia console administrativo quando exigida; `platform_owner` só provisionado fora da API pública.
4. Tenant vencido não executa UI/API/worker e é reativável sem perda de dados.
5. Sem carência automática e sem portal de leitura após suspensão; dados preservados e solicitações legais atendíveis em canal separado.
6. Tarefa repetida, webhook repetido ou evento fora de ordem não duplica medições nem ativa licença indevidamente.
7. Sem fornecedor habilitado retorna `PROVIDER_UNAVAILABLE`; não inventa resultados.
8. `REVIEW` e `NO_MATCH_WITHIN_DEPTH` nunca viram colocação 1.
9. Posição por marca não infla Top 1 comercial; duplicatas de termos são normalizadas com rastreabilidade.
10. Comparação temporal exige mesma superfície, coordenada, dispositivo, termo e profundidade compatível.
11. 40 termos × 25 pontos = 1000 tarefas por superfície; preflight mostra orçamento e bloqueia estouro.
12. PDFs só usam snapshots VERIFIED com localização, fonte e data; requerem aprovação humana.
13. Upload de colagem GPT rejeita `locationRef` de outro tenant, JSON inválido, payload volumoso e instrução maliciosa embutida.
14. JWT válido de usuário removido da organização perde acesso imediatamente após revogação server-side.
15. Logs não expõem segredos, tokens ou dados pessoais em excesso; restore testado a partir de backup.
16. Produção nunca apresenta dados fictícios como medição real.

## 12. Decisões a resolver antes de comercializar

**Bloqueadoras de go-live:** M08 (fornecedor e contrato de uso/retensão de dados); direitos do software e dados de clientes; termos e política de suspensão imediata e acesso a dados; preço/limites por plano; meios de cobrança; política de segurança/backup.

**Não bloqueadoras do núcleo:** B05 trial, B06 white-label, M05 3×3, A04 heatmap, R03 CSV/XLSX na interface, U03 mobile completo, U05 importação das Jares. M04 opção 1 ponto visível é pendente, mas baseline interno necessário. M09 coletor Chrome é opcional e sujeito a conformidade.

## 13. Fontes técnicas e regulatórias (verificadas 30/10/2026)

- Google AI Studio full-stack: https://ai.google.dev/gemini-api/docs/aistudio-fullstack?hl=pt-br
- DataForSEO Maps SERP API: https://docs.dataforseo.com/v3/serp-maps-live-advanced/
- DataForSEO preço: https://dataforseo.com/pricing/serp/google-maps-serp-api
- Business Profile Performance API: https://developers.google.com/my-business/reference/performance/rest
- Google Maps Platform Terms (vigentes): https://cloud.google.com/terms/maps-platform/pt-br
- Cloud Tasks idempotência: https://docs.cloud.google.com/tasks/docs/common-pitfalls
- Cloud Scheduler ao menos uma entrega: https://docs.cloud.google.com/scheduler/docs/overview
- Lei Software: https://www2.camara.leg.br/legin/fed/lei/1998/lei-9609-19-fevereiro-1998-364738-normaatualizada-pl.html
- LGPD: https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html

---

**Resumo executivo:** produto comercial independente, GPT para inteligência e clusters, sistema para aferição automática autorizada, múltiplos clientes isolados, sem licença exposta ao frontend, sem IA obrigatória no núcleo, com bloqueio contratual no servidor e evidência rigorosa de cada ranking.
