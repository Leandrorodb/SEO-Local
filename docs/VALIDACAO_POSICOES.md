# Validação de posições — 18/11/2026

O usuário questionou a diferença entre os números do coletor e uma consulta
anônima. A prioridade é a leitura correta; modificar o gerador de termos não
resolve essa divergência. As alterações anteriores de termos excederam o escopo
da comparação pedida. Esta correção trata do coletor e da validação das capturas.

## Comparação manual controlada

Foi aberta uma janela anônima real do Chrome, acessado o Maps e pesquisado
literalmente `moto peças Varginha`. A lista foi expandida pela interface, sem
login nem alteração de permissões. A ficha cadastrada, de CID
`11472765297648071940`, não estava entre os 20 resultados carregados na área
geral daquela consulta. Outra unidade, “Terremoto Moto Peças - Loja 2”, apareceu
na lista; ela não é a ficha cadastrada.

Ao repetir a MESMA consulta na área do coletor — centro
`-21.5358126, -45.4482479`, zoom 15 — a sequência manual começou por:

1. VARGINHA MOTO PEÇAS
2. Moremoto Moto Peças
3. ET2RODAS Moto Peças
4. Moto Minas
5. Terremoto Moto Peças, endereço Antônio Bernardes Pereira, 950

A primeira captura do coletor mostrou essa mesma sequência. A confirmação
seguinte leu 3º; o resultado foi REVIEW/null. Esse teste comprova a divergência,
não uma posição confirmada em 3º ou um erro de contagem naquela primeira imagem.

## Fragilidades corrigidas

O coletor reutilizava perfil e sessão do Chrome entre identificação e medições.
Task IDs diferentes não comprovavam sessões independentes. Agora cada captura
abre um perfil separado, sem cookies ou buscas anteriores do próprio coletor.

O contexto antes era reconstruído a partir do pedido. Agora é lido da URL e do
campo de pesquisa efetivamente observados: termo, centro, zoom e tamanho de
janela, além do identificador da sessão isolada. A URL armazenada é normalizada
para remover parâmetros de rastreamento, mantendo a consulta e a área observadas.

Uma captura local sem contexto ou sessão comprovados não confirma posição. As
duas capturas devem corresponder à área solicitada e usar janelas equivalentes,
mas sessões diferentes. Mudança de termo, centro, zoom ou tamanho da janela
recusa a confirmação. As regras de identidade, prefixo orgânico completo,
duplicatas, anúncios, validade temporal e concordância de posição continuam.

Novos registros usam `firebase-pair-v2-context`. O histórico anterior é
preservado e identificado na tela como anterior à verificação de área/sessão.
A tela permite abrir a mesma consulta e área no Maps; não promete que a ordem
permanecerá igual em outro momento.

## Teste real após a correção

Um teste local, sem gravar medições no banco de produção, executou duas capturas
em sessões distintas para `moto peças Varginha`, na mesma área fixa. Ambas
retornaram 5º, com a sequência acima, coincidindo com a conferência manual.
IDs de sessão e screenshots privados foram preservados fora do Git.

Isso valida este caso e este recorte, não uma posição universal em Varginha ou
uma garantia para todas as consultas. O coletor continua experimental. Novos
casos divergentes devem permanecer inconclusivos, sem escolher uma captura.
