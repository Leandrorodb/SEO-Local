# Local Rank Tracker V4.7 — correções da identificação do Google Maps

## Problema observado

Na V4.6 o navegador de coleta podia abrir uma aba inicial `about:blank` enquanto a pesquisa corria em outra aba. O código também ignorava silenciosamente fichas cujo nome, endereço, cidade ou coordenadas não fossem encontrados no DOM, e mantinha uma transação aberta no banco durante a navegação. O aviso `--no-sandbox` é uma configuração do navegador automatizado; isoladamente, não prova a causa da falha de identificação.

## O que mudou

- O Chrome tenta navegar **na aba inicial**, sem uma aba `about:blank` excedente; a opção de sandbox do Chromium foi habilitada.
- A identificação espera o Maps renderizar, usa seletores alternativos para o endereço e comunica motivos diferentes para navegação, bloqueio/consentimento e detalhes incompletos.
- Cada tentativa salva `work/local-chrome-evidence/ultima-identificacao.json` e, quando possível, `ultima-identificacao.png` para diagnóstico local (não enviar sem revisar os dados exibidos).
- A consulta ao navegador acontece **fora** da transação de autorização no PostgreSQL.
- Coordenadas `@lat,lng` do link são tratadas como centro da tela, **não** como localização comprovada da ficha.
- O formulário `Medir empresa` inclui **cadastro com dados conferidos pelo operador** para o piloto local. Exige CID no link, campos completos, coordenadas, concordância explícita e validação no backend. O banco marca a origem `user_attested_cid`, e a interface mostra que a ficha foi conferida pelo operador, não extraída pelo Google. O coletor continua exigindo CID/nome e evidência para retornar posição. Fora do piloto local, a rota é bloqueada.
- Cadastro pelo Chrome permanece automático quando ele de fato consegue extrair dados completos. Não há posições inventadas.

## Atualizar SEM perder dados da V4.6

1. **Não crie outro banco nem apague a pasta `work/` ou o arquivo `.env`.** Faça uma cópia de segurança da instalação atual se ela tiver dados importantes.
2. Abra o ZIP da V4.7 e entre na pasta `local-rank-tracker` que está dentro dele.
3. Copie **o conteúdo** dessa pasta para a sua pasta atual `local-rank-tracker`, onde existe `package.json`, substituindo arquivos de código. O ZIP não inclui `work/` nem `.env`.
4. Na pasta atualizada, execute `ATUALIZAR_E_REABRIR.cmd`. O iniciador encerra os serviços dessa instalação, executa `pnpm build` com dependências já instaladas e abre o painel compilado.
5. No navegador, pressione `Ctrl+F5` e teste `Medir empresa` com a URL da ficha.
6. Se falhar, confira `work/local-chrome-evidence/ultima-identificacao.json` e `ultima-identificacao.png`. O relatório identifica se faltaram nome, cidade, endereço ou coordenadas precisas.

## Se o Maps não fornecer os dados

No painel `Medir empresa`, use **Cadastrar com dados conferidos manualmente**. Confirme nome, endereço, cidade e latitude/longitude *do ponto da ficha*, não o centro do mapa. É necessário que a URL contenha um CID. O sistema registra essa origem de forma explícita. Medições continuam inconclusivas se o Chrome não conseguir comprovar a posição; não há substituição por posições sintéticas.

## O que foi testado e o que NÃO foi

Testes locais sem npm: medidor legado (13), autenticação local (1), utilitários de Maps (5), sintaxe TypeScript/TSX. Não foi executado um build React/Fastify completo nem uma navegação real do Google Maps no Chrome do seu Windows a partir deste ambiente, porque o registro npm está inacessível aqui. A V4.7 é uma correção para homologação, não um produto comercial certificado. O uso comercial de dados do Google Maps exige respeito aos termos aplicáveis e uma fonte de dados autorizada.
