# Entrega de engenharia — 04/11/2026

**Situação:** o caminho completo funciona em homologação local. Ainda não há medição comercial validada. Nenhuma ficha de cliente foi consultada e nenhum ranking real foi atribuído.

| Validação executada | Resultado |
|---|---|
| Instalação offline com lockfile congelado, TypeScript, Vite e build dos serviços Node | Aprovados |
| Testes unitários, PostgreSQL, segurança, concorrência, API compilada e Chrome | **26 passaram, zero falhas, zero pulados** — [saída](../../evidence/saas.tap.txt) |
| Regressão da aplicação original | **13 passaram** — [saída](../../evidence/legado.tap.txt) |
| Dependências de produção | **Zero avisos reportados** na execução — [resultado](../../evidence/audit-prod.json) |
| Cópia física após desligamento nativo; restauração em outro diretório e porta | **150 medições e 2 relatórios** sintéticos, mesmos IDs/hashes de relatórios, registros protegidos por RLS e histórico imutável — [evidência](../../evidence/restore.json) |
| Quatro workflows do GitHub e comandos Bash | YAML analisado e sintaxe Bash verificada; não executados em GitHub, Docker ou Google Cloud |

## O que foi demonstrado

No Chrome, o teste concluiu login OIDC/PKCE com emissor de teste, cadastro via Maps, confirmação por identificador, colagem de **JSON GPT**, revisão e ativação dos termos, grade 5×5, prévia, processamento por worker, resultados, aprovação humana e download de [PDF sintético](../../evidence/DEMO-relatorio.pdf). A alternância de tema e a ausência de erros de página também foram verificadas. O teste das 1.000 consultas é **uma prévia de 40 termos × 25 pontos**, sem compra nem alegação de 1.000 medições reais. [Painel escuro](../../evidence/DEMO-dark.png) · [Painel claro](../../evidence/DEMO-light.png).

A API compilada serviu o frontend e negou acesso anônimo aos dados e acesso a arquivos privados. A suíte exercitou JWT adulterado, MFA insuficiente, revogação, organização e unidade alheias, custo/cota concorrentes, repetição de pagamento e job, suspensão e reativação. O worker rejeitou token de usuário, identidade de serviço incorreta e corpo com tenant forjado. Resultados sem identidade suficiente ficaram sem posição.

O consolidado usa as observações mais recentes por recorte, exclui termos de marca dos indicadores comerciais e respeita a ACL. Redes podem ser filtradas. Ações de oportunidade são persistidas por unidade e medição. Alertas internos cobrem liderança, queda material ou repetida, falhas, proximidade de auditoria e consumo do orçamento (50/80/95%). Não há envio automático de mensagens.

## Registro por etapa

- Baseline `43900e2`: [inventário do ZIP e lacunas](AUDIT-BASELINE.md).
- Fundação `b53140d`: [migrations, servidor, licença e isolamento](ETAPA-1.md).
- Interface e operação `5cfc2d1`: [arquivos, resultado dos 23 testes daquele ponto e pendências](ETAPA-2.md).
- Etapa final: `apps/api/analytics.ts`, `signals.ts`, UI de resultados, gráficos e redes; migration `006_insights.sql`; testes de oportunidade, alertas, fronteira de tenant e JSON no navegador; encerramento nativo do PostgreSQL em `infra/test-postgres.ts`; promoção condicionada e documentação. O [inventário por etapa](../../evidence/arquivos.txt) lista cada caminho. O [OpenAPI](openapi.json) registra as rotas implementadas; os schemas de payload completos ficam nos validadores Zod e nas rotas.

## Ativação da primeira auditoria

Na tela Automação, o administrador pode autorizar a primeira medição ao salvar a rotina. Um único commit do PostgreSQL grava a configuração, reserva as consultas e vincula a auditoria inicial. O teste de integração enviou duas solicitações simultâneas com a mesma chave e comprovou uma rotina, uma auditoria e 25 reservas. Alterar o corpo com a mesma chave resultou em conflito. Sem fonte habilitada ou com teto insuficiente, o banco permaneceu sem rotina, execução e reserva para aquela tentativa. A opção inicia desmarcada.

A etapa acrescentou a migration 007 e atualizou a API Fastify, tela Automação, contrato OpenAPI e teste de integração. O build, os 26 testes SaaS e os 13 do legado passaram após a alteração.

## Pendências reais

1. **M08:** titular escolher e contratar fonte, definir direitos por superfície, retenção, redistribuição e teto de custo. Implementar o adaptador específico. Só então executar e confrontar uma pequena auditoria real autorizada, do link ao PDF. O fornecedor da suíte não faz parte da aplicação comercial.
2. Configurar o IdP e testar MFA/reauth com contas reais em homologação separada. Formalizar titularidade, termos, política de suspensão/portabilidade, planos, meios de cobrança e canal externo de atendimento. O registro manual de pagamento e a suspensão já funcionam; não há gateway integrado.
3. Provisionar Cloud SQL, IAM, secrets, serviços, agendamento, observabilidade e backups; ensaiar restauração e rollback na nuvem, validar o contêiner e liberar o domínio. A fila operacional no código é PostgreSQL. O serviço interno aceita entrega OIDC, mas não há fila Cloud Tasks criada nem comprovada.
4. O painel por unidade mostra uma janela de até 10.000 observações para o histórico; o consolidado da carteira consulta o histórico completo. A lista de fichas está limitada a 500 por requisição e a de concorrentes/alertas a 500 registros. Medir carga, retenção, índices e limites adequados antes de contratar grandes carteiras. Os agendamentos executam em instantes UTC; não há ajuste de recorrência pelo horário de verão local.
5. O relatório usa snapshot privado no PostgreSQL; screenshots/evidências brutas de terceiros e Storage remoto dependem de direitos e configuração. O portal autenticado registra pedidos administrativos mesmo com licença suspensa; o atendimento fora da plataforma precisa de canal humano configurado.

Permanecem pendentes, sem ativação comercial: trial (B05), white-label (B06), opção visível de um ponto (M04), grade 3×3 (M05), fornecedor (M08), Chrome coletor (M09), heatmap (A04), exportação CSV/XLSX pela UI (R03), suporte mobile completo (U03) e importação das Jares (U05). Não há importação de termos via planilha, carência automática ou acesso operacional de leitura após suspensão.

[Iniciar e testar](../README.md) · [Operação, backup e rollback](OPERACAO.md).
