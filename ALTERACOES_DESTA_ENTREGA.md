# Entrega de desenvolvimento — piloto experimental sem API paga

**Data:** 04/11/2026

## Alterações de código efetivamente feitas

1. Integrado o adaptador `local_chrome_preview` ao mecanismo de `RankProvider` já utilizado pela V3.
2. Habilitação explícita somente em `NODE_ENV=staging`, com variável de aceite e PostgreSQL local. O modo comercial permanece desabilitado por padrão.
3. Implementado o resolver experimental da URL do Maps; a identidade só é confirmada no backend após segunda checagem.
4. Implementado medidor Chrome visível, geolocalização por ponto, armazenamento privado de captura e resultado, sem evasão de desafios.
5. Limitado o piloto a **25 consultas/auditoria** e **MAPS, desktop, pt-BR**. Custo de API da integração: zero. Outras superfícies não são medidas.
6. Corrigida a diferença entre resultados experimentais observados e dados sintéticos nas telas de ranking e nos feedbacks/PDFs.
7. Interface de empresas aceita buscar dados de ficha a partir de URL, escolher candidato, preencher os campos e solicitar confirmação automática no servidor quando possível.
8. Corrigida a contagem de profundidade orgânica para não contar anúncios como resultados orgânicos verificados; erros ou ausência de feed permanecem inconclusivos.
9. Testes do adaptador de CID, limite de superfícies e barreira local; teste adicional de rotulagem de relatórios incluído na suíte normal.
10. Guias de execução e limites do piloto em `COMECE_AQUI_WINDOWS.md`.

## Limitações verificadas

- **O código foi implementado e testado parcialmente, mas o SaaS não foi executado end-to-end neste ambiente.** O registry não disponibilizou `pnpm@11.25.0`, impedindo `pnpm install`/`pnpm build` e os testes integrais.
- Não houve navegação/medição Google Maps em tempo real com credenciais ou sessão do usuário; o Chrome Windows, OIDC real e PostgreSQL integrado precisam ser testados no PC.
- Não há promessa de disponibilidade 24h ou direitos comerciais da fonte. Não publicar o sistema como coleta automatizada licenciada.
- O visual novo do AI Studio continua guardado em `design-reference/ai-studio/` para migração seletiva posterior. O backend SQLite inseguro não foi incluído na aplicação operacional.
- Um ponto e grade 3×3 permanecem pendentes, conforme decisões anteriores. O piloto é 5×5.

## Resultado dos testes desta entrega

Veja `VALIDACAO_DESTA_ENTREGA.txt` dentro do ZIP.
