# Firebase — estado verificável

**Atualização vigente:** o backend já foi publicado no Render Free, conectado
ao Firestore; o frontend Firebase foi atualizado para sua URL externa.
Leia [a publicação atual](../../ESTADO_PUBLICACAO_ATUAL.md). O restante desta página
registra as etapas anteriores e seus bloqueios, não o estado atual do deploy.

Decisão posterior do usuário: não pagar e buscar BACKEND GRATUITO NA NUVEM.
Blaze e provedor pago descartados para esta etapa. A sugestão de priorizar
execução no computador foi uma interpretação errada. Alternativa candidata,
ainda não implementada: API em hospedagem gratuita externa (Render/Netlify),
preservando site/login/banco no Firebase Spark. Verificar limites, conta,
fila/worker, autenticação e conexão frontend antes de prometer funcionamento.

Atualização em 17/11/2026: `npm run typecheck` e `npm run build:firebase`
passaram. Quatro testes de precisão e um teste de integração Auth/Firestore
nos emuladores passaram. O fluxo usa capturas SINTÉTICAS e segundo fator
injetado somente na dependência de teste: não comprova ranking ou MFA reais.
O backend em `apps/firebase/` é um protótipo de migração, NÃO foi publicado.
Google Authentication foi configurado, mas não existe fluxo MFA completo.
O plano permanece Spark; nenhuma fonte de posições real foi configurada.
Consulte `PROMPT_CONTINUIDADE_ANTIGRAVITY.md` para continuar sem confundir
o site de acompanhamento com uma implantação operacional.

`firebase.json` aponta para as futuras Functions; `firebase.review.json` é
a configuração publicada de acompanhamento. Esta responde JSON explícito
de backend indisponível em vez de devolver HTML nas rotas da API.
As regras Firestore negam acesso direto do cliente. A autorização da API
Admin SDK, os índices, agendamentos e reconciliação ainda precisam de revisão.

Projeto: `seo-local-64b17`. Site: https://seo-local-64b17.web.app.

Tentativa de deploy de Functions em 17/11/2026: compilação passou, mas o
Firebase bloqueou a implantação porque o projeto não está no plano Blaze.
A API Artifact Registry não pôde ser habilitada sem upgrade. Consulta direta
à API Cloud Billing confirmou `billingEnabled: false`. Backend não publicado;
Hosting de acompanhamento preservado. Nenhuma conta de cobrança foi vinculada.
Console: https://console.firebase.google.com/project/seo-local-64b17/usage/details.

A publicação inicial é uma versão de acompanhamento da interface, explicitamente
sem sessão ou dados de clientes. Ainda não permite cadastrar ou medir empresas.
Para reproduzir o build: `node infra/build-review.mjs`.

A migração do backend PostgreSQL para Firestore Standard está em andamento em
`apps/firebase`. O código antigo continua preservado no histórico e durante a
transição. Novos componentes só devem substituir o runtime depois dos testes.

Critérios antes de declarar a versão operacional:

- Login Firebase, verificação de email e MFA administrativo.
- Cadastro e confirmação de ficha com isolamento entre organizações.
- Termos, grades, auditorias, fila e orçamento persistidos no Firestore.
- Duas capturas reais concordantes por medição, identidade estável, ordem
  orgânica completa até a ficha e evidências persistidas.
- Histórico, concorrentes e relatórios com revisão e exportação PDF.
- Nenhuma posição numérica para capturas incompletas ou divergentes.

Hospedar a interface não comprova estes critérios. Cloud Functions exige plano
Blaze e a medição exige credenciais e autorização de uma fonte de resultados.
Nenhum serviço pago ou consulta paga foi ativado nesta publicação inicial.
