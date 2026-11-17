# Publicação verificada — 17/11/2026

## Endereços e infraestrutura

- Frontend: https://seo-local-64b17.web.app.
- API: https://seo-local-api-vh6q.onrender.com.
- Saúde: https://seo-local-api-vh6q.onrender.com/health.
- Backend Render Free, serviço `srv-dbuam6qfngtc73e8s60g`, workspace confirmado
  pelo usuário. Deploy `dep-dbud689srm7s73egs510` chegou a LIVE, commit `5127fd7`.
  Esse é o commit efetivamente implantado, não uma declaração de que qualquer
  push posterior já entrou em produção.
- Firebase `seo-local-64b17`, plano Spark, Firestore Standard em São Paulo.
  Nenhuma conta de faturamento vinculada, Functions pagas ou provedor pago ativado.
- Identity Platform habilitado no Spark, limite de 3.000 usuários ativos por dia,
  TOTP por aplicativo habilitado. SMS não foi ativado.
- Identidades privadas separadas para API e coletor, com papéis mínimos para
  Firestore e leitura de usuários na API. Nenhuma chave foi colocada no Git ou
  no frontend. O isolamento de documentos continua sendo responsabilidade da API
  e do coletor; Admin SDK não é limitado pelas Security Rules do navegador.

## O que foi comprovado

1. API local compilada acessou o Firestore real e retornou `/health` HTTP 200.
2. A API pública retornou HTTP 200 com `database.connected: true`.
3. Endpoint protegido sem token retornou 401; preflight da origem Firebase
   retornou 204 com a origem permitida.
4. Índices Firestore publicados. O índice de ordenação de `audit_logs` foi
   corrigido para configuração de campo único, em vez de índice composto inválido.
5. TypeScript, build Render, build frontend, 90 testes da suíte principal e
   integração Firebase em emuladores passaram. Esta última também validou que
   o piloto pode liberar operações comuns sem MFA, mantendo equipe protegida.
6. O frontend publicado usa a API externa inclusive no diagnóstico de saúde.
   Inclui matrícula TOTP, desafio de login e reautenticação; o backend mantém
   a exigência de MFA nas operações protegidas.

## Medição real experimental

O coletor abriu o Maps e identificou Terremoto Moto Peças por CID
`11472765297648071940`, endereço e coordenadas extraídos da ficha.
No ponto da ficha, `moto peças` teve capturas completas em 4º e 5º;
`moto peças varginha` teve capturas em 5º e 2º. Ambos foram marcados REVIEW,
posição `null`, pois divergiram. Essas posições observadas não são um ranking
confirmado. Nenhum resultado do piloto foi gravado como medição de cliente.

O primeiro piloto também revelou um problema real de ciclo de vida: fechar a
última aba do Chrome podia invalidar o contexto da captura seguinte. O coletor
agora reaproveita a aba dedicada e fecha o navegador ao encerrar o processo.

Os arquivos de prova ficam localmente em `work/local-chrome-evidence/` da cópia
de trabalho. Permanecem privados, fora do Git. A migração não constitui licença
comercial dos dados do Maps nem garante estabilidade dos resultados.

## Próximos passos obrigatórios

- Login Google do proprietário confirmado no site, com organização carregada.
  Por decisão explícita do usuário, cadastro/termos/grades/medição devem funcionar
  só com Google neste piloto: `REQUIRE_MFA_FOR_OPERATIONAL_WRITES=false`.
  Equipe, licenças e aprovação administrativa continuam exigindo MFA. Nenhum
  fator foi criado no lugar do usuário. Nunca enviar chaves/códigos no chat.
- Validar pelo site: organização → identificação → cadastro confirmado → termo
  → ponto único → auditoria → evidências → histórico → revisão/PDF.
- Ainda não foi comprovado um resultado numérico concordante em duas capturas
  reais pelo fluxo publicado. Não declarar o produto inteiro pronto.
- Agendamentos de auditoria e demais módulos não têm homologação completa.
- Render Free pode hibernar; a primeira requisição após inatividade pode demorar.
  O coletor Chrome roda separadamente no computador e precisa permanecer ativo
  para resolver fichas/medir. A API na nuvem funciona sem o computador, mas
  deve recusar novas medições quando o heartbeat do coletor estiver ausente.

## Reprodução

Node >=24.12, dependências do lockfile instaladas:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build:render
npm.cmd run build:hosted
npx.cmd firebase-tools@latest deploy --only hosting --config firebase.spark.json --project seo-local-64b17
npm.cmd run collector:local
```

O comando do coletor exige configuração privada no computador autorizado.
Nunca incluir credenciais em comandos, commits ou screenshots. O launcher
recusa emuladores/Neon e valida a identidade dedicada ao projeto antes de iniciar.
