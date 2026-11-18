# Auditoria inicial — 30/10/2026

Fonte: ZIP fornecido, 26 arquivos, sem .git, banco, evidências ou credenciais. Commit 43900e2 conserva o original. Os TXT são a especificação e o prompt V3; copiados sem alterações para docs com os nomes solicitados.

Inventário: src/server.js (HTTP local, CRUD, fila, revisão, evidências), src/db.js (SQLite/migração incremental), services/measurement.js (CID, anúncios, nome em REVIEW, Playwright), keywords.js (biblioteca determinística), report.js (WhatsApp/CSV), import.js (CSV/ZIP, hash, verificação), public (interface completa), scripts/bat/sh, data (5 fichas/160 termos, nenhum ranking), testes, documentação e bundle textual que duplica fontes.

Baseline: **13/13 testes aprovados**, Node 22.14.0. Legado preservado em legacy; fora do servidor SaaS. Não executados coleta, seed de clientes ou importação de históricos.

Lacunas: ausência de autenticação/RBAC/MFA/tenant/licença/PostgreSQL; revisão humana promove nome sem identidade estável; exclusão de termo apaga histórico; painel soma históricos sem separar marca; comparação não congela parâmetros; fila em processo; Chrome não autorizado como fonte comercial. CSV e Jares permanecem apenas no legado (D04/U05).

Preservação: regressões de CID, anúncios, termos e importador continuam testadas. Biblioteca determinística reutilizada. Nenhum arquivo original alterado.

Gate: sem release comercial até fonte autorizada, identidade externa, OIDC/MFA real, nuvem, restauração e fluxo real ponta a ponta. Sem trial, 3x3, heatmap, importação Jares, export CSV ou white-label completo.
