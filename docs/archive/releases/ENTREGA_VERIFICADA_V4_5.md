# Local Rank Tracker V4.5 — Entrega de código para homologação, NÃO lançamento comercial

## O que foi alterado nesta entrega

- Corrigida a rota `/measure` no Fastify quando ele serve o build compilado; recarregar a página mantém o aplicativo.
- Incluída rota autenticada e isolada por organização `GET /v1/provider/status` que informa se o medidor local está habilitado, sem inventar resultados.
- O assistente **Medir empresa** exibe o estado real do motor e impede a preparação da auditoria enquanto a fonte está desabilitada.
- O gerador de termos agora aceita bairro confirmado e combina nicho, termos de categoria, geografia, intenção e serviços declarados — sempre como sugestão para revisão.
- Incluída exportação de resultados em CSV na tela Resultados: posições inconclusivas permanecem vazias e células são protegidas contra fórmulas de planilha.
- Testes para bairro, ausência de serviços inventados, escape de CSV, classificação e geração.

## Testes que passaram NESTE ambiente

- 10 testes de componentes puros (geração de termos e exportação CSV)
- 13 testes do medidor legado
- 2 testes do provedor de login local
- Transpilação sintática de arquivos TypeScript/TSX alterados sem diagnósticos

## O que NÃO foi comprovado neste ambiente

- `pnpm install`, `pnpm build`, `pnpm test` e suíte de integração PostgreSQL do projeto modificado, porque esta sessão não consegue baixar dependências do npm.
- Abertura completa em um Windows real desta versão específica.
- Descoberta universal automática de fichas do Google Maps e coleta efetiva de posições no Chrome do usuário.
- Funcionamento comercial ininterrupto, sem custos, sem bloqueios ou licenciamento de dados de ranking.
- Integração de gateway de pagamentos, produção em nuvem, provedor comercial autorizado, testes de carga ou MFA real de produção.

## Arquitetura preservada

React/TypeScript + Fastify/Node.js + PostgreSQL/RLS + worker + OIDC local opcional + medidor Chrome experimental isolado.
Não há empresas predefinidas, nem rankings fictícios apresentados como resultados reais neste novo código.

## Critérios objetivos para declarar completo para piloto local

1. Instalação limpa, build e testes completos concluídos no Windows.
2. Login local e criação de organização sem credenciais padrão de produção.
3. Duas fichas reais de nichos distintos adicionadas só por URL no painel.
4. Nome, cidade, coordenadas e CID verificados e confirmados de modo confiável.
5. Geração, revisão e ativação de termos sem scripts separados.
6. Auditoria executada no Chrome, com ao menos um resultado conclusivo por CID e inconclusivos apresentados honestamente.
7. Histórico, exportação CSV, feedback e PDF consistentes com o banco.
8. Reexecução com o mesmo idempotency key sem duplicatas; proteção entre organizações.

Se algum desses pontos falhar, a aplicação está EM HOMOLOGAÇÃO e não deve ser anunciada como pronta.
