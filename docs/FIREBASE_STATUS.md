# Firebase — estado verificável

Projeto: `seo-local-64b17`. Site: https://seo-local-64b17.web.app.

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
