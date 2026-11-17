# Local Rank Tracker V4.1 — descoberta automática de termos (sem API paga)

## Base adotada

Esta entrega continua sobre a **V4 PostgreSQL/Fastify/React**, e NÃO sobre a segunda aplicação SQLite criada pelo AI Studio. Mantém o controle de autenticação, tenant, licenciamento e a integração experimental de Chrome já existente na V4.

## O que foi realmente alterado

1. `packages/domain/auto-keywords.ts` — novo motor determinístico com 40 categorias reutilizáveis, detecção pelo **nome confirmado** da empresa, criação de termos básicos da categoria/cidade/marca e inclusão **somente de serviços informados e confirmados pelo operador**.
2. `apps/api/app.ts` — `/v1/niches` e `/v1/locations/:id/keywords:suggest` usam o novo motor, dentro da transação multi-tenant e da ACL existente. A chamada aceita `niche: "auto"`, `products` e `limit`. Sugestões são apenas sugestões; nenhuma posição é gerada.
3. `apps/web/src/pages.tsx` — a tela de termos começa com **detecção automática**, lista dinâmica de categorias e opção de limite 20/40/60/100; mostra o aviso de revisão.
4. `tests/auto-keywords.test.ts` — testes unitários para dois nichos reais diferentes, classificação desconhecida, classificação específica, deduplicação e quantidade.
5. `infra/local-postgres.ts` — mantém duas correções anteriores de Windows: banco `lrt` criado após inicialização interrompida e processo de desenvolvimento mantido ativo.

## Como aplicar o PATCH à V4 que já está funcionando no seu PC

**Não extraia outro ZIP completo sobre seu projeto atual.** Faça cópia da pasta do projeto, inclusive dos arquivos privados, em local seguro. Extraia o ZIP de patch sobre uma cópia ou compare os cinco arquivos individualmente. Não substitua `.env`, `work/`, credenciais, configurações de login ou dados PostgreSQL.

Após aplicar, na raiz do projeto:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
pnpm.cmd test:legacy
pnpm.cmd test
```

Se estiver com a V4 executando, encerre de forma normal a API e o frontend e reinicie-os após o build. Mantenha a configuração OIDC já adotada; este pacote não fornece contas administrativas de exemplo.

## Como testar no painel

1. Entre com sua conta já configurada no sistema e selecione a organização.
2. Cadastre a ficha em Empresas. O Maps poderá exigir confirmação de cidade, endereço e coordenadas; **não são inventados**.
3. Vá a Termos e clusters. Deixe `Detectar pelo nome da ficha`, informe serviços realmente confirmados (opcional) e clique em `Gerar termos automaticamente (sem IA paga)`.
4. Confira as sugestões no campo de texto. Para empresas com nome ambíguo, **selecione manualmente o nicho** antes de importar.
5. Use `Validar prévia` e `Importar sugestões`, depois revise e ative os termos corretos.
6. Crie a rotina/auditoria; o motor experimental do Chrome continua dependendo de habilitação explícita no PC, do login e da confirmação confiável de identidade.

## Limitações, sem maquiagem

- **Não é um lançamento comercial concluído.** A V4 ainda exige homologação ponta a ponta no seu computador, OIDC e mecanismo autorizado de dados de ranking para uso comercial.
- Nome de empresa não contém necessariamente categoria, serviços, bairro e endereço. A detecção de nicho usa apenas informações conhecidas. Sem categoria confiável, propõe termos de marca e solicita confirmação do analista.
- A quantidade 20/40/60/100 é um **teto**, não promessa de gerar esse número sem dados reais. Preferimos poucos termos corretos a muitos serviços inventados.
- Não importamos a interface SQLite insegura nem os perfis/caches de navegador do ZIP do AI Studio.
- Resultados coletados por navegador são experimentais e sujeitos a restrições técnicas/contratuais do Google Maps; não contorne CAPTCHA ou bloqueios.
- Este ambiente de entrega permitiu executar **13 testes do legado**, **6 novos testes do gerador**, e checar a sintaxe dos arquivos TS/TSX alterados. O build integrado da V4 e os testes de integração PostgreSQL/Chrome **não foram executados aqui**; execute os comandos no Windows antes de usar os dados.

## Evidência de auditoria do ZIP mais recente do AI Studio

Comparado com `nexus-local-rank-tracker(1).zip`, `nexus-local-rank-tracker (1).zip` possui os mesmos 319 caminhos e somente `infra/test-postgres.ts` mudou. As rotas SQLite, a geração baseada exclusivamente em Gemini e o coletor com fallback para Jares permaneceram inalterados. O relatório de progresso do Gemini descreve objetivos, não código implementado.
