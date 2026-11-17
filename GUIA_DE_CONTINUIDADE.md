# Local Rank Tracker — Resgate seguro após limite dos agentes

Data: 04/11/2026.

## O que contém este pacote

- **Aplicação operacional de referência:** código original da V3 do Codex, restaurado na raiz (`apps/`, `packages/`, `infra/`, `tests/`, `legacy/`). É a base que emprega React, Fastify e PostgreSQL.
- **Interface produzida pelo AI Studio:** preservada apenas em `design-reference/ai-studio/src/` para migrar visual e componentes futuramente. NÃO é uma segunda aplicação habilitada; seus `fetch('/api/...')` precisam ser adaptados ao contrato seguro da V3.
- **LEGACY_TEST_REPORT.txt:** execução independente de `node --test legacy/tests/*.test.js`: 13 aprovados, 0 falhas.

## Por que não estamos usando o projeto exportado do AI Studio como aplicação principal

Na exportação recebida, a aplicação em `src/` usava API SQLite em middleware do Vite, fora dos contratos de autenticação/isolamento multi-tenant da V3. A versão exportada também incluía dados e pontuações sintéticas rotuladas como verificadas, perfil de navegador local e banco SQLite. Não foram copiados para esta versão de resgate.

**A interface visual nova foi guardada, mas NÃO está conectada à API do Codex.** Este pacote não anuncia falsamente que o fluxo de auditoria automática já está pronto.

## Como validar no Windows

Requisitos: Node.js 22.14+, pnpm na versão configurada no `package.json`, Google Chrome e ambiente apropriado para os testes PostgreSQL. Execute na pasta extraída:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
pnpm.cmd test:legacy
pnpm.cmd test
```

Se pnpm não estiver disponível, confira a versão exigida no `package.json` e instale usando um método de distribuição confiável.

Para iniciar banco, IdP, API, worker e frontend, siga o README.md original e docs/OPERACAO.md. Não existe credencial demo universal. O login OIDC real depende da configuração do seu provedor de identidade.

## Próxima implementação — por etapas, sem gastar com IA nem API de medição

1. **Verificar build e 26 testes do SaaS no Windows.** O ambiente atual não pôde instalar as dependências npm por indisponibilidade do registry; aqui só foram executados os 13 testes do legado.
2. **Migrar o visual**, tela por tela, de `design-reference/ai-studio/src/` para `apps/web/src/`, usando a autenticação e os endpoints já existentes na V3. Não importar `src/server/api.ts`, `src/db.js` ou `src/server/seedData.ts`.
3. **Piloto do coletor local:** construir serviço de agente Windows explícito, com pareamento autenticado, uma organização autorizada, polling de tarefas, leases, idempotência, limites, resultado com proveniência, validação de CID e tratamento de erros. Não usar cookies, perfis locais ou credenciais exportados do usuário.
4. **Teste com 1 empresa e poucos termos** em homologação. Sem integração paga de ranking. Parar e registrar estado inconclusivo caso o provedor externo bloqueie a coleta; não contornar verificações.
5. **Só após teste real e autorização do uso dos dados** habilitar a execução recorrente e o uso comercial, se permitido pelas condições aplicáveis.

## Limites e segurança

- A V3 original traz `DisabledProvider` como padrão. Custo de API de ranking é zero enquanto desabilitado; também não há coleta real automática.
- Os 13 testes aprovados não significam aprovação dos 26 testes SaaS, do login real ou do coletor Chrome em produção.
- Não publique o ZIP diretamente em uma hospedagem estática e não suba arquivos `.env`, banco SQLite, perfis de navegador ou dados privados de clientes.
- Use este projeto em repositório **privado**; faça backup/commit antes de cada integração.
