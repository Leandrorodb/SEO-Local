# Continuidade — 18/11/2026

Prioridade esclarecida pelo usuário: corrigir a medição de posições; não
substituir esse trabalho por alterações de termos. Leia
[VALIDACAO_POSICOES.md](VALIDACAO_POSICOES.md). O coletor agora isola sessões,
registra contexto observado e exige sua equivalência antes de confirmar números.

O trabalho foi retomado pelo usuário. A medição real no site foi concluída e as
duas capturas de cada uma das três pesquisas concordaram. Veja o
[estado publicado](ESTADO_PUBLICACAO_ATUAL.md) para números, horário e limites.

## Resolvido nesta retomada

- Nicho específico para oficina de motos; não gerar termos de carros para essa categoria.
- Fila antiga cancelada, reservas encerradas e 21 termos incorretos desativados.
- Cancelamento pelo painel, recuperação de tarefas interrompidas e evidências legíveis.
- Resultados priorizam termos ativos; o histórico desativado permanece acessível.
- Correção da dependência que causava avisos de falha do GitHub e CI confirmado.
- README e documentação atuais; guias e workflows antigos arquivados; npm unificado.

## Próximas validações

1. Repetir homologação com outras fichas e pontos, mantendo os casos divergentes inconclusivos.
2. Validar geogrid e retomada após interrupção no computador real.
3. Homologar relatórios e aprovação administrativa, sem criar credenciais pelo proprietário.
4. Verificar e concluir os módulos de automação antes de anunciá-los como operacionais.

Não diminuir o rigor para obter números, não inventar serviços e não apresentar
fixtures como medições reais. Não ativar cobrança ou provedores pagos.

## Cópia de trabalho e infraestrutura

Cópia atual: `outputs/SEO-Local-deploy`, branch `codex/render-publicacao`.
`main` e `desenvolvimento-gemini` remotos são mantidos alinhados; o Render está
configurado para esta última. A cópia anterior `outputs/SEO-Local` foi preservada
com alterações locais e está desatualizada. Não a sobrescreva ou publique sem
comparar o diff com a versão atual. Seu teste `terremoto-e2e.test.ts` usa fixtures
rotuladas de reais e precisa de revisão antes de incorporar.

Configuração privada em `work/` do workspace original, fora do Git. Nunca imprimir
arquivos `*-private.json`, tokens ou conteúdos de `.env`. O coletor é iniciado
por `npm run collector:local`; requer o PC autorizado ligado. Site Firebase e API
Render permanecem publicados independentemente do processo de coleta.
