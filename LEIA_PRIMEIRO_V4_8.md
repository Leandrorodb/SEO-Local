# Local Rank Tracker 4.8 — Posições comprovadas

**Atualização para a instalação V4.7 que já está funcionando no Windows.**

## O problema corrigido

Na V4.7, durante a leitura dos cartões, o coletor rolava para o cartão da empresa para obter uma captura de tela. O próprio Maps virtualiza a lista de resultados; essa rolagem podia perder cartões e reduzir indevidamente a posição registrada. Além disso, os anúncios eram removidos da contagem sem apresentar ao operador a distinção entre posição **visual** e **orgânica**.

## O que muda na V4.8

1. O coletor percorre o feed a partir do topo sem interromper a enumeração para capturar prints.
2. Registra e reconcilia **duas passagens independentes** pela mesma pesquisa. Cada uma exige começo no topo, hidratação estável, cartões extraídos estruturalmente e rolagem em pequenas sobreposições.
3. Se houver cartão não reconhecido, anúncio ambíguo, mudança de ordem, salto ou diferença entre as duas passagens, o resultado **não recebe posição numérica**.
4. CID exato **e nome** da empresa devem coincidir. Para posições encontradas, a captura do cartão e da tela é exigida *após* as passagens.
5. Evidências em `work/local-chrome-evidence/local-*-prova.json`, com posição visual (inclui anúncios) e posição orgânica (exclui anúncios), cartões na ordem observada, causa da aprovação/reprovação, ponto e URL da pesquisa. Os prints `-topo-1.png`, `-topo-2.png`, `-cartao.png` e `-contexto.png` ajudam na auditoria.
6. O painel e CSV indicam que a posição numérica é **orgânica**.
7. Medições antigas da fonte `local_chrome_preview` (V4.7 ou anteriores) deixam de ser apresentadas como verificadas em rankings, resumos, oportunidades, concorrentes e novos relatórios. Os dados antigos **não são apagados**. PDFs/WhatsApp antigos são bloqueados nos endpoints de exportação; faça novas medições antes de produzir um relatório.

## Instalação sem perder o banco

1. Feche o sistema atual.
2. **Faça uma cópia de segurança da pasta inteira** da V4.7, em especial `work/` e `.env`.
3. Extraia este ZIP e copie o conteúdo da pasta `local-rank-tracker` **por cima da pasta `local-rank-tracker` da sua instalação**, substituindo os arquivos de código. Não copie/exclua `work/` ou `.env`.
4. Execute `ATUALIZAR_E_REABRIR.cmd` dentro da pasta instalada. O comando recompila o projeto e reabre o painel.
5. Refaça uma auditoria de 3 termos e confira os JSONs de prova antes de medir todos.

**Não use os rankings V4.7 anteriores como base de feedback para clientes.**

## Limitações e segurança dos resultados

- Coleta experimental de baixo volume via Google Maps/Chrome local, sem API paga e sem garantia de disponibilidade. O Google pode alterar a lista, resultados, localização e comportamento da interface.
- Não é possível prometer **erro matematicamente zero** a partir de uma página dinâmica. O novo modo é conservador: prefere INCONCLUSIVO a uma posição sem evidências estáveis.
- Um resultado orgânico pode ser 3º enquanto o cartão aparece em 7º visualmente se houver quatro anúncios antes dele. A prova deixa ambos os valores discriminados.
- Verifique sempre o mesmo termo, ponto geográfico, dispositivo, idioma, contexto e instante da pesquisa ao comparar com a tela. Outros locais e sessões podem mostrar outra ordem.
- Coleta comercial recorrente exige fonte de dados autorizada/licenciada, verificação de conformidade e testes reais de aceitação. Esta versão não afirma homologação comercial.

## Validação

Foram executados testes automatizados do verificador, do filtro de medições antigas e do medidor legado, além da validação sintática dos arquivos modificados. **O build React/Fastify e a coleta real no Windows não foram executados neste ambiente**, por ausência das dependências npm e do navegador instalado no computador do usuário.
