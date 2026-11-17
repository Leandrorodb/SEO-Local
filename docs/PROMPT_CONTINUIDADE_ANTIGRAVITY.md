# Cole este prompt no Sonnet 4.6 do Antigravity

**Atualização de publicação (17/11/2026):** leia primeiro
`docs/ESTADO_PUBLICACAO_ATUAL.md`; as seções antigas abaixo são contexto histórico.
A API `https://seo-local-api-vh6q.onrender.com` já está LIVE no Render Free e seu
`/health` confirmou conexão ao Firestore. Frontend Firebase publicado apontando
para essa API. Identity Platform ativado mantendo Spark; TOTP por aplicativo
habilitado (sem SMS). O usuário escolheu explicitamente login Google sem exigir
código adicional para cadastro e medição neste piloto; a flag privada
`REQUIRE_MFA_FOR_OPERATIONAL_WRITES=false` libera somente operações comuns,
mantendo equipe/licença/aprovação administrativa protegidas. Login e organização
já foram confirmados no site. Dois pilotos reais identificaram a ficha, mas retornaram inconclusivo
por divergência entre capturas; não tratar como posição comprovada nem teste
completo pelo site. Credenciais privadas dedicadas estão fora do Git, em `work/`
do workspace original. Não copie nem exponha seus conteúdos. O código mais
recente está em `main` e `desenvolvimento-gemini`; o serviço Render existente
acompanha `desenvolvimento-gemini`. Use `npm run build:hosted` e
`firebase deploy --only hosting --config firebase.spark.json` para reproduzir o
frontend. `npm run collector:local` usa configuração privada local; novas
medições dependem desse processo e do computador ligado.

**Correção mais recente do usuário (17/11/2026): quer BACKEND GRATUITO NA NUVEM.**
Não pagar, não ativar Blaze nem vincular faturamento. A sugestão anterior de
priorizar execução no computador foi uma interpretação errada do pedido.
Investigar hospedagem gratuita externa da API Node/Fastify, preservando
Hosting/Auth/Firestore no Spark. Render Free é uma alternativa candidata
(https://render.com/docs/free), ainda NÃO provisionada: verificar conta e termos
atuais; suspende web services após 15 minutos sem tráfego e não equivale a um
worker continuamente ativo. Outra possibilidade é adaptar a API para Netlify
Functions no plano gratuito, verificando créditos e limites reais da conta.
Não declarar que um serviço foi escolhido, criado ou publicado antes de fazê-lo.
Adaptar entrypoint, secrets privados, Firebase Admin/IAM, CORS com origem exata,
URL de API no frontend e processamento durável da fila. Não abrir regras nem
expor service accounts no navegador. Separar disponibilidade do backend da fonte
de resultados: uma API gratuita não fornece posições reais automaticamente.
As opções pagas descritas adiante são contexto histórico, não autorização.

Continue a implementação do meu sistema SEO-Local / Local Rank Tracker.
Faça o trabalho no código existente e mantenha o Git atualizado. Minha primeira
prioridade é medir uma empresa de verdade. Interface carregada, build e dados
de demonstração não significam sistema funcionando. Não invente posições,
evidências, recursos concluídos ou resultados de teste.

## Objetivo e decisões

O produto atende uma operação de gestão de Google Perfil da Empresa: cadastrar
fichas, confirmar a unidade certa, selecionar termos por nicho e serviços reais,
medir posições por coordenada em ponto único e GeoGrid 5×5, comparar histórico
e concorrentes e entregar relatórios revisados. Existem telas de organizações,
equipe, planos/licenças, oportunidades e automação que também devem funcionar.

Quero Firebase Authentication, Firestore Standard e Firebase Hosting. Não quero
depender de Neon/PostgreSQL no produto hospedado. Preserve o legado e o histórico
durante a migração, evitando reescrita desnecessária. Já autorizei alterações
normais de código, Git e deploy, e pedi que o repositório fosse público.
Não ative cobrança aberta nem compre créditos sem limites de gasto aprovados.
Avance sozinho nas tarefas técnicas e pergunte apenas por bloqueios reais de
conta, credencial, informação ausente ou decisão financeira.

## Projeto e fontes

- Repositório público: https://github.com/Leandrorodb/SEO-Local, branch `main`.
- Clone neste computador:
  `C:\Users\Usuario\Documents\Codex\2026-11-17\as-x20\outputs\SEO-Local`.
- Firebase: `seo-local-64b17`, nome SEO Local, número `515177647393`.
- Web app: `1:515177647393:web:b6b679aa9eb46d9e0a4260`.
- Firestore `(default)`, Standard, região `southamerica-east1` (São Paulo).
- Site publicado: https://seo-local-64b17.web.app.
- Comece lendo `docs/FIREBASE_STATUS.md`, este prompt, `package.json`,
  `firebase.json`, `firebase.review.json` e verificando `git status`/`git log`.
  Não trate descrições históricas como prova do estado atual.
- O código já incorpora a exportação recente do AI Studio:
  https://aistudio.google.com/apps/aa92458c-a14a-431f-aec1-ebc2eaf97015?showAssistant=true&showPreview=true
- Contexto original, se acessível:
  https://chatgpt.com/g/g-p-6850c4639854819180157a68de74a45b-trabalho/c/6ae486d8-cfd0-83e9-abde-e608c820a223
  Não dependa desses links para trabalhar no repositório.

## Estado real, sem confundir preparação com entrega

O site é uma versão de acompanhamento. **Não existe medição real funcionando
na produção.** O projeto continua Spark; Functions não foram implantadas.
Firestore e login Google foram configurados, mas MFA administrativo não tem
implantação/fluxo completo. Não há credenciais de fonte real no runtime novo.
Nenhuma consulta paga foi executada. Não anuncie o sistema como pronto.

O erro antigo `Unexpected token '<' ... is not valid JSON` ocorria porque rotas
da API recebiam o HTML do Hosting. `firebase.review.json` devolve agora um JSON
`BACKEND_NOT_DEPLOYED`; isso melhora o diagnóstico, não implementa o backend.
O `firebase.json` aponta para a futura Function `api` em São Paulo. Não substituir
o deploy de acompanhamento por essa configuração antes de implantar/testar API.
`npm run build:review` ativa explicitamente uma interface somente leitura.

## Código preparado

- `apps/firebase/store.ts`: Admin SDK, organizações, membros, proprietário,
  autorização, licença e exigência de MFA administrativo.
- `api.ts` e `owner.ts`: Fastify com cadastro, termos, grades, auditorias,
  histórico, evidências, relatórios, equipe, planos e licença manual.
- `provider.ts`: contrato de captura, comparação de duas capturas e adaptador
  DataForSEO desabilitado por padrão, ainda sem validação real.
- `worker.ts`: criação transacional de auditorias, tarefas determinísticas,
  reserva de orçamento, duas capturas por ponto, evidências e contabilidade.
- `functions.ts`: HTTP e gatilhos Firestore; agendamento de recuperação.
- `dev.ts`: só permite execução com Auth e Firestore emulados.
- `infra/build-firebase.ts`: gera `functions/lib/index.js` e package das Functions.
- Frontend: `apps/web/src/firebase-auth.ts`, `session.ts`, `firebase-config.json`.
- Regras Firestore negam acesso direto do navegador. O Admin SDK ignora essas
  regras: revisar autorização por rota, organização, papel, licença e unidade.
  Não abrir regras para contornar erros.

## Verificações já realizadas

Passaram `npm run typecheck`, `npm run build:firebase`, quatro testes em
`tests/firebase-provider.test.ts` e um teste em `tests/firebase/api.test.ts`.
Este último usa Auth e Firestore dos emuladores e cobre cadastro → termos →
grade → auditoria → duas capturas artificiais → posição 7 artificial → revisão
→ PDF, além de isolamento, orçamento, idempotência, bloqueio sem MFA e escrita
direta negada. O segundo fator é injetado exclusivamente no teste porque ele
não matricula TOTP real. Isso NÃO comprova MFA ou ranking em produção.
A suíte legada inteira e a interface não foram revalidadas após a migração.

## Ordem de execução

1. Reproduza o estado atual e preserve alterações/dados existentes. Faça o
   login funcionar com organização e proprietário corretos. Configure
   `OWNER_EMAIL` privadamente para o dono real; nunca elevar o primeiro usuário
   que entrar. Implementar matrícula, desafio e reautenticação MFA reais,
   verificando requisitos atuais do Identity Platform. Não aceitar MFA
   declarado pelo frontend nem desativar sua exigência para passar no fluxo.
2. Priorize um caminho completo: login → ficha confirmada → um termo → ponto
   único → orçamento aprovado → medição real → evidência/posição ou diagnóstico
   inconclusivo → histórico → relatório revisado/PDF.
3. Escolha uma fonte realmente disponível e autorizada. Existe um coletor Chrome
   local experimental no legado que pode ser investigado para medição local sem
   API paga, respeitando os termos da fonte. Ele não roda automaticamente no
   Hosting; um coletor local exigirá conexão autenticada explícita com o backend.
   DataForSEO é uma alternativa paga preparada, não uma assinatura existente.
   Não inventar credenciais, gratuidade, contrato ou autorização de cobrança.
4. Functions requerem Blaze. Verifique documentação oficial atual, conta de
   faturamento, runtime/região e limites antes de ativar custos. Alertas de
   orçamento não impedem gastos: implementar limites no app/provedor e
   instâncias. Se houver bloqueio externo, conclua tudo que for independente.
5. Implante e teste backend antes de apontar Hosting para ele. Desative
   `READ_ONLY` apenas quando o fluxo estiver funcional. Atualize o mesmo Git
   e endereço publicado a cada etapa coerente validada.

## Precisão obrigatória

- Confirmar CID/Place ID e nome, sem confundir homônimos, cidades ou unidades.
- Registrar termo, coordenada, idioma, superfície, dispositivo, data,
  profundidade, versão de parser, fonte, custo e evidências verificáveis.
- Diferenciar posição orgânica de visual com anúncio. Se há seis orgânicos
  antes da ficha, a posição é 7, não 3.
- Exigir duas capturas independentes e completas até a empresa, com mesma
  posição e sequência anterior de identidades. Resposta repetida ou cache antigo
  não serve como confirmação independente. Validar atualidade real dos dados.
- Truncamento, lacuna, duplicata, identidade conflitante, desafio, erro,
  divergência ou falta de evidência: posição `null` e diagnóstico claro.
  Ausência deve se referir apenas à profundidade realmente examinada.
  Não inventar zero, última posição ou ausência geral sem prova.
- Dados sintéticos nunca podem aparecer como produção em histórico/relatórios.
  Hash sozinho sem resposta/evidência acessível não basta para auditoria humana.

## Pendências conhecidas que exigem revisão

- Frontend ainda contém contratos e textos legados OIDC/Neon. Conferir cada
  chamada/payload/envelope e o orçamento enviado pelo fluxo Medir empresa;
  valor zero não pode ser contornado removendo controles de gasto.
- Cadastro atestado deve permanecer UNRESOLVED. Confirmar uma ficha existente
  não resolvida deve atualizar identidade e unicidade corretamente.
- `firestore.indexes.json` está vazio. Criar índices das consultas reais,
  inclusive collection groups, e validar em ambiente real. Definir retenção,
  TTL, exclusão, backups e restauração conforme custos e licença da fonte.
- Agendamentos de auditoria não foram migrados. O schedule atual apenas procura
  tarefas interrompidas. Implementar recorrência com orçamento/idempotência.
- Recuperação marca RECONCILIATION_REQUIRED, mas ainda precisa finalizar
  auditorias/reservas com procedimento seguro, sem repetir chamada possivelmente
  cobrada. Propagar incerteza no ledger da execução inteira, não só da última
  tarefa. Revalidar licença/revogação entre capturas e antes de entregar dados.
- Resolução paga de ficha também precisa de limite e contabilidade. Conferir
  schemas reais, custos, profundidade, paginação, datas e erros do DataForSEO.
  Compilar um adaptador não comprova compatibilidade da resposta real.
- Revisar `isDemo` em todas as respostas/resumos. Conferir cotas na revogação e
  reativação de membros e autorização de todas as rotas Admin SDK.
- O header PDF `X-Content-SHA256` deriva do conteúdo, não dos bytes PDF;
  corrigir ou esclarecer o contrato. Validar aprovação e snapshot imutável.
- Cobrança automática não existe: webhook retorna indisponível. Não simular
  pagamentos. Auditar alterações manuais de licença e logs.
- O teste legado `tests/integration/browser-flow.ts` procura “Entrar com
  segurança”, enquanto a interface mudou para Google; manter compatibilidade
  explícita do modo de teste OIDC ou ajustar expectativa corretamente.
- Testar bridge Fastify/Functions com HTTP real, autenticação, corpos, erros,
  reinício, concorrência, reentrega de gatilhos, IAM, secrets e índices.

## Ambiente e comandos

Use Node >=24.12. Versões de dependências estão em `package.json`/lockfile.
Neste computador existe Node portátil em
`C:\Users\Usuario\Documents\Codex\2026-11-17\as-x20\work\node24\node-v24.22.3-win-x64`
e JRE em
`C:\Users\Usuario\Documents\Codex\2026-11-17\as-x20\work\jre21\jdk-21.0.13+9-jre`.
Se necessário, adicione ao PATH só da sessão; não substitua instalação do usuário.
No PowerShell, dentro do repo:

```powershell
git status --short
git log -5 --oneline
node --version
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build:firebase
node --import tsx --test tests/firebase-provider.test.ts
```

Para teste de integração, Java no PATH, em terminal separado:

```powershell
npx.cmd --yes firebase-tools@latest emulators:start --project demo-seo-local --config firebase.review.json --only auth,firestore
```

Depois:

```powershell
$env:GCLOUD_PROJECT='demo-seo-local'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
node --import tsx --test tests/firebase-provider.test.ts tests/firebase/api.test.ts
```

Nunca rodar fixtures sintéticas na produção. Limpar variáveis de emulador antes
de operações reais. Verificar processos existentes nas portas 8080/9099/4000/4400.
Firebase CLI já foi autenticada neste computador; confira sessão sem copiar
tokens. Use `npx.cmd` no Windows.

Configuração privada do backend, após revisão: `OWNER_EMAIL`, `RANK_PROVIDER`,
`RANK_PROVIDER_AUTHORIZED`, `RANK_MAX_COST_MICROS_PER_CAPTURE`,
`RANK_GLOBAL_MONTHLY_BUDGET_MICROS` e, se escolhido DataForSEO,
`DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` no Secret Manager. Também definir
orçamento mensal da organização. Valores são micros de USD; obter limites
aprovados, sem inventar preços. Nunca colocar segredos em frontend/Git/logs.
Config web Firebase é pública por projeto; chave de serviço/token não é.
O `.env` antigo pode conter credenciais Neon: não publicar nem expor seu conteúdo.

## Critério de conclusão

Provar primeiro uma medição real pequena com conferência manual da evidência,
depois outra empresa/nicho e variações de termo/coordenada. Validar anúncios,
truncamento, divergência, ausência, cotas, revogação e isolamento entre contas.
Provar no navegador publicado: login, cadastro, medição, persistência após
recarregar, histórico, revisão e PDF. Commitar/enviar cada etapa validada sem
segredos, publicar o mesmo código e informar commit, URL e limitações reais.
Não dizer que está pronto por causa de build, teste sintético ou página aberta.
