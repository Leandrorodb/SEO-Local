# Etapa 2 — interface, operação e segurança
04/11/2026. Conferência local no Windows, com PostgreSQL e Chrome reais; empresas, usuários, pagamentos e rankings dos testes são sintéticos.

- Interface em apps/web e packages/ui: carteira, marcas, fichas, termos, medições, comparações, revisão de relatórios, logotipo privado e portal.
- apps/api, apps/worker e packages: bloqueios de escopo e orçamento, worker OIDC, expiração de licença e entrega da UI sem acesso por caminho arbitrário.
- Migrations 004 e 005: integridade das referências por unidade, marca da agência, proibição de posições verificadas nulas.
- infra, workflows e contrato OpenAPI: build, scripts operacionais e configuração para CI e contêiner. Nenhum deploy.
- Build TypeScript/Vite/esbuild aprovado. 23/23 testes SaaS; 13/13 testes do legado. Inclusos teste do processo Node compilado, login PKCE no navegador, 25 pontos, aprovação/PDF, concorrência, restore, MFA, redes e expiração idempotente. Auditoria de dependências: 2 altos e 5 moderados em produção antes; zero após remover @fastify/static e atualizar drizzle-orm.
- Pendências desta etapa: alertas configuráveis, tratamento das oportunidades, homologação do fornecedor autorizado e do ambiente externo. Inventário exato dos arquivos: git show --name-status no commit desta etapa.
