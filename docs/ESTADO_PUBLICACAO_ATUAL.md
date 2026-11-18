# Publicação e validação — 18/11/2026

- Site: https://seo-local-64b17.web.app
- API: https://seo-local-api-vh6q.onrender.com
- Saúde: https://seo-local-api-vh6q.onrender.com/health
- Repositório público: https://github.com/Leandrorodb/SEO-Local
- Firebase `seo-local-64b17`: Spark, Firestore Standard em São Paulo.
- API: Render Free, serviço `srv-dbuam6qfngtc73e8s60g`.

A revisão funcional `de5e2f5` foi publicada no frontend e no backend. O deploy
Render `dep-dbuhngo8v5cc73954hb0` chegou a LIVE. A reorganização posterior mantém
o mesmo motor de medição; confira o SHA do deploy no painel antes de afirmar
que qualquer push posterior já está implantado.

## Medição real pelo site

Auditoria `f2abc2c7-5c40-4dc4-88e6-5cab3bc0bed5`, iniciada na interface publicada,
concluída com 3/3 tarefas e duas capturas independentes por pesquisa.

| Termo | Tipo | Captura 1 | Captura 2 | Resultado |
| --- | --- | --- | --- | --- |
| moto peças | Comercial | 2º | 2º | VERIFIED |
| Terremoto Moto Peças | Marca | 1º | 1º | VERIFIED |
| Terremoto Moto Peças Varginha | Marca | 1º | 1º | VERIFIED |

Ficha: Terremoto Moto Peças, Varginha, CID `11472765297648071940`. Ponto único:
`-21.5358126, -45.4482479`, Maps desktop, português. Para `moto peças`, as capturas
foram às 00:33:46 e 00:33:59 de 18/11/2026, horário de Brasília. Ambas mostraram
ET2RODAS Moto Peças em 1º e a ficha pesquisada em 2º, sem anúncio nessa leitura.

As listas, horários, referências e hashes foram persistidos no Firestore e
conferidos na tela de evidências do site autenticado. Os screenshots originais
ficam no PC do coletor, privados. Esse resultado vale para esse recorte e momento;
não garante que qualquer usuário verá o mesmo ranking ou que a posição se manterá.

Os pilotos anteriores divergiram em 4º/5º e 5º/2º e permaneceram inconclusivos.
Não foram reinterpretados como posições confirmadas. A fila antiga de termos
inadequados foi cancelada e 21 termos de automóveis desativados, sem apagar histórico.

## Testes e GitHub

- 94 testes principais, 13 do legado e verificações do iniciador/login local passaram.
- Integração Firebase em emuladores passou: cadastro, termos, auditoria, evidências,
  revisão/PDF sintéticos, autorização, isolamento, idempotência, cancelamento e recuperação.
- Auditoria de dependências de produção: zero vulnerabilidades.
- Os dois workflows do commit funcional `de5e2f5` passaram no GitHub Actions.
- A falha anterior de `@grpc/grpc-js` foi corrigida; notificações e auditoria continuam ativas.

## Acesso e limites

Login Google e organização do proprietário foram conferidos no site. Cadastro,
termos, grades e medição dispensam TOTP neste piloto por escolha do usuário.
Equipe, licenças e aprovação administrativa mantêm MFA. Nenhuma chave/código
foi criado no lugar do usuário ou colocado no Git/frontend.

O site e a API estão na nuvem. O coletor Chrome depende do PC ligado; a API
recusa novas medições sem presença recente. Render Free pode hibernar. Não há
Neon, plano pago, faturamento vinculado ou provedor pago ativado nesta arquitetura.

Geogrids com mais pontos, outras empresas, automação contínua e aprovação de
relatórios com MFA ainda precisam de homologação real. O teste sintético de PDF
não equivale à aprovação de um relatório de cliente no site.

[Desenvolvimento e publicação](DESENVOLVIMENTO.md) · [Validação detalhada](VALIDACAO_2026-11-18.md)
