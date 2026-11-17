# Local Rank Tracker v4.2 — Pacote consolidado Windows

## Objetivo
Entrega local-first universal sobre React/Fastify/PostgreSQL, sem cliente de exemplo. O sistema usa as bibliotecas de nichos para sugerir palavras-chave por empresa. A coleta do Chrome é experimental e não depende de DataForSEO.

## Funcionalidades nesta entrega
- Iniciador único para Windows: `ABRIR_LOCAL_RANK_TRACKER.cmd`.
- Inicialização do PostgreSQL persistente, migração, owner, organização local, licença de teste e provedor local.
- OIDC local PKCE com entrada automática **só** via loopback e opt-in explícito (sem MFA independente; proibido em produção).
- Cadastro de empresa por URL do Google Maps, resolução assistida pelo Chrome e confirmação de identificador.
- Gerador de termos gratuito por nicho e importação por colagem do GPT.
- Aprovação em lote de termos revisados.
- Medição em ponto único (recomendado para vários termos) ou GeoGrid 5x5.
- Worker, resultados, indicadores e relatórios com revisão humana; evidências locais e resultados inconclusivos explícitos.
- 100 consultas por auditoria experimental local, custo de API zero, processamento sequencial.

## Limitações importantes
- Não há garantia de medições reais corretas ou contínuas. O Chrome/Playwright, os seletores do Google Maps, o CID e a localização devem ser conferidos em um piloto real no notebook. CAPTCHA ou bloqueios interrompem as coletas; não existe bypass.
- O Windows precisa ter Node 22+, pnpm e Chrome; não é um `.exe` nativo ou instalador MSI. Primeira execução pode instalar dependências do npm.
- Não é release comercial: acesso automático local não é MFA; o provedor Chrome não concede direitos comerciais de coleta/redistribuição.
- O código foi validado sintaticamente neste ambiente; suite OIDC, testes do legado e unitários de termos foram executados. Não foi possível executar o build completo com PostgreSQL e Chrome no Windows a partir deste ambiente.
- O app valida somente correspondências por CID/PlaceID; ausência de identificação confiável não vira ranking `VERIFIED`.

## Testes executados nesta entrega
- 13 testes legados (passaram)
- 2 testes OIDC (passaram, um deles para acesso automático exclusivo de loopback)
- 6 testes do gerador de palavras-chave após transpilar o TypeScript (passaram)
- 41 arquivos TypeScript/TSX analisados sintaticamente (sem erros)

## Começar
Extraia em uma pasta nova, dê dois cliques em `ABRIR_LOCAL_RANK_TRACKER.cmd` e depois siga `CLIQUE_AQUI_PRIMEIRO.txt`.
Não misture arquivos com V4 antigas. Se a instalação anterior estiver ativa nas mesmas portas, encerre-a na pasta antiga primeiro.
