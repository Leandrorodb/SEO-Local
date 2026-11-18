# Continuidade do SEO-Local

Continue este projeto existente. Antes de editar, leia `README.md`,
`docs/ESTADO_PUBLICACAO_ATUAL.md`, `docs/RETOMAR.md` e `docs/DESENVOLVIMENTO.md`.
Compare o Git atual com os commits públicos; não restaure uma entrega antiga.

## Objetivo e decisões do usuário

O usuário precisa cadastrar fichas Google Maps e medir posições corretas por
termo e ponto, com histórico, concorrentes e relatórios. Quer o repositório
público e atualizado e acompanhar o sistema hospedado. Não aceita posições
inventadas ou provas sintéticas apresentadas como reais.

Use Firebase Spark para Hosting, Google Authentication e Firestore Standard.
A API já está no Render Free. Não usar Neon, não ativar Blaze, faturamento,
planos pagos ou APIs pagas. Cadastro e medição devem funcionar apenas com login
Google neste piloto; não reimpor MFA nessas operações. Administração sensível
continua protegida. Credenciais novas e códigos pessoais são do usuário.

## Estado comprovado

Site https://seo-local-64b17.web.app; API https://seo-local-api-vh6q.onrender.com.
Repo https://github.com/Leandrorodb/SEO-Local, público. `main` e
`desenvolvimento-gemini` alinhadas; Render usa `desenvolvimento-gemini`.

Em 18/11/2026 uma auditoria iniciada no site concluiu 3/3 pesquisas reais:
`moto peças` 2º/2º e duas variações da marca 1º/1º, para Terremoto Moto Peças,
no ponto da ficha em Varginha. Listas e horários foram conferidos na tela de
evidências. São recortes datados, não garantia de ranking estável.

A fila anterior foi cancelada, os termos indevidos de automóveis desativados e
o gerador corrigido para oficina de motos. Cancelamento não inicia segunda
captura quando já foi solicitado; preserva histórico e devolve reservas não
utilizadas. Tarefas locais interrompidas são encerradas sem pedidos novos;
provedores de custo desconhecido precisam de reconciliação.

O coletor Chrome é experimental, gratuito de API, depende do computador ligado
e atende uma só organização autorizada. O backend não executa Chrome. Sem
heartbeat recente, recusa auditorias novas. Render Free pode hibernar.

## Regras de precisão

Confirme CID/Place ID e nome em DUAS capturas independentes. Exija a mesma
posição e sequência orgânica completa até a ficha. Separe anúncios. Rejeite
lacunas, duplicatas, identidade ambígua, evidências faltantes, horários inválidos
e capturas antigas. Divergência resulta em REVIEW e posição null. Nunca escolher
uma leitura para produzir um número ou repetir até obter o resultado desejado.

## Código e operação

Código atual em `apps/firebase`, painel em `apps/web`, contratos/domínio em
`packages`, builds/collector em `infra`. O código PostgreSQL em `apps/api`,
`apps/worker` e os documentos em `docs/archive` são legado preservado.
Use npm e `package-lock.json`, Node 24.12+, Java 21 para os emuladores.

Rode os checks apropriados: `npm run build`, `npm test`, `npm run test:firebase`,
`npm run test:legacy`, `npm audit --omit=dev --audit-level=high`.
A integração Firebase usa fixtures sintéticas claramente identificadas.

Publique o frontend com `npm run build:hosted` e Firebase Hosting usando
`firebase.spark.json`. Nunca implante Functions com faturamento no piloto.
API Render: `npm ci --include=dev && npm run typecheck && npm run build:render`,
start `node dist/render/server.js`, saúde `/health`. Verifique SHA/LIVE real:
este serviço público não iniciou autodeploy nos pushes observados. Não duplique
um deploy em andamento. Git atualizado sozinho não prova que a hospedagem mudou.

Configuração privada fica fora do Git no `work/` do workspace original. Não
imprima service accounts, tokens ou `.env`, nem coloque chaves no frontend.
Use `npm run collector:local` no PC autorizado. Não varra outro tenant.

Prioridades restantes estão em `docs/RETOMAR.md`. Dê atualizações curtas em
português, execute o trabalho autorizado e descreva limites concretos. Não
anuncie todos os módulos prontos só porque o login ou uma medição funcionou.
