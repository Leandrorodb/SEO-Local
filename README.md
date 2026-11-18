# SEO-Local · Local Rank Tracker

Painel de SEO local para cadastrar fichas, revisar termos e medir posições orgânicas com evidências por ponto de pesquisa.

**Acessar:** [seo-local-64b17.web.app](https://seo-local-64b17.web.app) · [Saúde da API](https://seo-local-api-vh6q.onrender.com/health)

A versão atual usa **Firebase Hosting + Authentication + Firestore (Spark)** e **API Render Free**. Não precisa de Neon. O coletor Chrome experimental roda separadamente no computador autorizado; novas medições e identificação de fichas dependem dele. Render Free pode hibernar.

## Como usar

1. Entre com Google e selecione a organização e a empresa.
2. Em **Medir empresa**, confirme a ficha e revise termos que correspondem ao negócio e à cidade. As sugestões já incluem a cidade da ficha e são separadas por clusters.
3. Com o coletor online, prepare uma auditoria em ponto único e inicie a medição.
4. Confira **Resultados → Histórico → Conferir capturas e motivo da decisão**. Resultados divergentes ou incompletos ficam inconclusivos, sem posição publicada.

O código adicional por aplicativo não é exigido para cadastro e medição neste piloto, por decisão do proprietário. Ações administrativas sensíveis mantêm proteção adicional.

No PC já configurado, `INICIAR_COLETOR.cmd` mantém o medidor conectado. Não abra uma segunda instância se o coletor já estiver online. Sem o PC ligado, o site continua acessível, mas não inicia novas capturas.

## Critério de posição

Uma posição só é confirmada quando duas capturas independentes concordam sobre a ficha (CID/Place ID e nome), a posição e toda a sequência orgânica anterior. Anúncios são separados; lacunas, duplicatas e capturas antigas impedem confirmação. O piloto é experimental e não garante posição estável nem primeiro lugar.

## Desenvolver e validar

Node.js **24.12+**, npm e Chrome para o piloto. Java 21 para os emuladores Firebase.

```sh
npm ci
npm run typecheck
npm run build
npm test
npm run test:firebase
npm audit --omit=dev --audit-level=high
```

O teste Firebase usa Auth/Firestore emulados e capturas sintéticas identificadas. Não comprova ranking real. [Desenvolvimento e publicação](docs/DESENVOLVIMENTO.md).

## Estrutura

| Pasta | Finalidade |
| --- | --- |
| `apps/firebase` | API, autorização, auditorias e fila Firestore atuais |
| `apps/web` | Painel React |
| `packages` | Contratos, domínio, componentes e provedores |
| `infra` | Builds e execução do coletor; ferramentas do legado identificadas nos guias |
| `tests` | Testes de precisão, segurança e integração |
| `docs` | Operação atual, arquitetura e validações |
| `scripts/windows` | Iniciadores da instalação PostgreSQL legada |
| `docs/archive` | Entregas antigas e configurações descontinuadas |
| `apps/api`, `apps/worker`, `legacy` | Implementação PostgreSQL e histórico preservados |

**Comece pela [documentação atual](docs/README.md).** O [estado publicado](docs/ESTADO_PUBLICACAO_ATUAL.md) distingue implantação de validação. Guias V3/V4 são históricos e não devem orientar a configuração Firebase.

`package-lock.json` é o lockfile usado em desenvolvimento, CI, Render e Docker. Credenciais, `.env`, capturas privadas e dados de execução ficam fora do Git. Nunca copie chaves para o frontend ou para uma issue.
