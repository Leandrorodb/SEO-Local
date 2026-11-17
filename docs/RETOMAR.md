# Retomar após a pausa solicitada em 17/11/2026

O usuário pediu para parar e continuar de casa. Não reiniciar coleta ou fazer
novos deploys sem a retomada do usuário. Site e API permanecem publicados.

## Estado observado

- Site Firebase e API Render Free online, Firestore conectado, login Google
  do proprietário confirmado. Operações comuns dispensam TOTP por escolha
  explícita do usuário; equipe/licenças/aprovação mantêm proteção adicional.
- No site foi cadastrada Terremoto Moto Peças, CID `11472765297648071940`,
  identificação real pelo coletor e confirmação via fila Firestore.
- Uma auditoria de 23 termos foi iniciada pela interface durante a sessão:
  `9ab49c5c-d535-4a84-a1c7-5eeb1a019a50`. Há resultados REVIEW/inconclusivos;
  não foi comprovada uma posição numérica concordante pelo fluxo completo.
- O coletor foi interrompido na pausa. A fila persistida não foi apagada.
  Revisar tarefas RUNNING/interrompidas e as que ainda estão QUEUED antes de
  reiniciar; não repetir capturas ou publicar posições sem prova.

## Prioridades da retomada

1. Corrigir o nicho automático: a categoria “Oficina mecânica de motos” foi
   interpretada como oficina de carros. A tela mostrou termos como “mecânico
   de carros” e “manutenção automotiva” para a motopeças. Não continuar a fila
   desses termos sem revisão. A relevância deve respeitar nome, categoria e
   serviços confirmados da empresa, sem inventar serviços.
2. Validar precisão de posições com evidência real. Pilotos locais divergiram
   4º/5º e 5º/2º, e corretamente retornaram `null`. Não escolher uma leitura,
   diminuir rigor para obter números ou apresentar fixtures como dados reais.
3. Corrigir e conferir os avisos por e-mail do GitHub. Causa confirmada:
   `npm audit` encontrou `@grpc/grpc-js` vulnerável. Override para `^1.14.7`
   e lockfile foram preparados e testados: 90 testes passaram e auditoria
   retornou zero vulnerabilidades após instalação limpa. Conferir o resultado
   do GitHub Actions no commit de checkpoint, sem desativar a auditoria.
4. Organizar o repositório inteiro como o usuário solicitou: README atual,
   documentação operacional clara, arquivo de versões legadas, redução de
   duplicações e branches alinhadas. Preservar histórico, dados, secrets e
   compatibilidade dos scripts ao mover arquivos. Ainda não foi executada a
   reorganização completa.

## Cópias locais e infraestrutura

- Trabalho revisado em `outputs/SEO-Local-deploy`, branch `codex/render-publicacao`.
- `main` e `desenvolvimento-gemini` remotos foram alinhados. A cópia antiga
  `outputs/SEO-Local` foi preservada: estava 27 commits atrás e continha uma
  edição não commitada em `apps/firebase/api.ts` e o teste
  `tests/firebase/terremoto-e2e.test.ts`. Esse teste usa dados fixos com rótulo
  de “real”; revisar sua proveniência antes de incorporar. Não apagá-lo.
- Render: `srv-dbuam6qfngtc73e8s60g`, workspace confirmado
  `tea-dbuak759fdbs73e6fgf0`, plano Free, URL
  https://seo-local-api-vh6q.onrender.com. Deploy operacional `0f8f665`.
- Frontend: https://seo-local-64b17.web.app, build `0f8f665`.
- Configuração privada fica em `work/` do workspace original, fora do Git.
  Não imprimir arquivos `*-private.json` nem tokens de CLI.
- `npm run collector:local` depende do PC autorizado ligado. Validar a fila
  antes de ligar. Firebase permanece Spark; usuário não autoriza gastos.
