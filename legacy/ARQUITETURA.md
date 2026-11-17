# Arquitetura — Nexus Local Rank Tracker

## Objetivo e limites

Aplicação local, mono-operador e de baixo custo para uma carteira de SEO local. Diferencia **sugestão de palavras-chave**, **coleta de resultados** e **verificação de posições**. Não garante geogrid nem substitui uma fonte licenciada de SERP para uso em escala comercial.

## Fluxo de dados

```
Cadastro de empresa + CID + coordenadas
        |
Clusters/termos P1-P3 (digitados, importados ou sugeridos sem IA)
        |
Fila persistida SQLite (1 navegação por vez)
        |
Chrome Playwright em janela visível / centro geográfico escolhido
        |
Resultado orgânico ordenado + nome + URL + detalhe + screenshot
        |
Identificação por CID => VERIFICADO
Identificação somente por nome => REVISÃO HUMANA
Sem lista ou bloqueio => SEM MEDIÇÃO COMPROVADA
        |
Histórico por run/termo e CSV
        |
Feedback WhatsApp com APENAS posições verificadas
```

## Separação de responsabilidades

- UI: `public/index.html`, `public/app.js`, `public/styles.css`.
- API e regras de acesso local: `src/server.js`.
- Persistência e esquema: `src/db.js` (`node:sqlite`).
- Ingestão de resultados e fila: `src/services/measurement.js`.
- Gerador determinístico de clusters: `src/services/keywords.js`.
- Feedbacks/exportação: `src/services/report.js`.
- Validação automatizada: `tests/measurement.test.js`.

## Critérios de qualidade

- Não confiar em nomes repetidos para classificar automaticamente.
- Ignorar, tanto quanto possível, inserções de anúncios; inspecionar evidências quando layout mudar.
- Posicionamento geográfico deve ter ponto e timestamp claros.
- Um acesso direto à ficha não é evidência de posição 1.
- Capturas e listas observadas ficam no armazenamento local.
- API escuta apenas em `127.0.0.1`; não expor porta na internet.
- Nenhuma mensagem de WhatsApp é enviada sem o usuário copiar.

## Evolução para SaaS multi-tenant

Quando o motor local estiver validado em uso real:

1. Isolar API REST e interface React/TypeScript; validar o contrato com Zod.
2. Migrar SQLite para PostgreSQL e incluir `org_id` em tabelas com políticas RLS.
3. Adicionar autenticação Firebase/Google e RBAC (admin, consultor, cliente).
4. Salvar jobs com idempotência em Redis/BullMQ e workers separados.
5. Usar storage privado de evidências por organização, com URLs temporárias.
6. Controlar custos por tenant, limites de consultas, consentimento e retenção LGPD.
7. Para verificação regular em grande escala, contratar fonte licenciada de dados de posição geográfica e garantir conformidade com termos da plataforma.
8. Adicionar testes E2E, métricas, alertas, monitoramento e deploy com backups/versionamento.

Não subir esta versão local diretamente em hosting público: ela **não possui autenticação nem isolamento multi-tenant**.

## v1.1 — Ingestão auditável de medições existentes

- `scripts/import-result.js`: importação local por CLI ou `.bat`, sem expor upload de arquivos por rede.
- `src/services/import.js`: parser CSV, leitura de ZIP local, normalização de empresas, correspondência exata de pesquisas e clusters, verificação independente de CID no JSON da lista, cópia de evidências e transação SQLite.
- `runs.source`: indica `LIVE` para coletas no painel e `IMPORT` para dados de medidores externos. Migração adiciona a coluna em bases v1 existentes sem apagar histórico.
- `imported_batches`: hash SHA-256 do CSV para impedir duplicação na mesma base.
- Políticas: posição importada só vira `VERIFIED` quando o CID encontrado no JSON corresponde à empresa e à posição da linha do CSV, descontando anúncios sinalizados. Nos demais casos a posição candidata vai para `REVIEW` e não aparece como conquista confirmada.
- Limitação: o processo de importação específico de `MEDICOES_JARES.csv` exige empresas previamente cadastradas com mesmo nome e termos/cluster previamente incluídos. A fila de coleta original continua separada.
