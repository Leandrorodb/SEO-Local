# Termos por cidade — correção de 18/11/2026

O usuário comparou os termos do sistema com uma busca anônima no Maps e
esclareceu que pesquisa de outra localidade. Portanto, o gerador precisa usar a
cidade da ficha no próprio termo, sem depender da localização do navegador.

## Comportamento

- Todas as sugestões incluem a cidade cadastrada, inclusive bairro, serviços
  confirmados e marca. Termos genéricos `perto de mim` deixam de ser gerados.
- O segmento Motopeças usa consultas naturais, como `motopeças Varginha`,
  `peças para motos Varginha` e `loja de peças para motocicletas Varginha`.
- Clusters: Motopeças na cidade; Peças para motocicletas; Lojas de motopeças;
  Marca. Produtos específicos, acessórios e serviços precisam de confirmação
  para entrar na lista; não são inferidos a partir de uma loja de peças.
- Termos importados manualmente continuam literais e precisam de revisão.
- Alterar o termo não altera a localização do observador. O coletor usa o
  ponto definido na auditoria; a tela esclarece essa diferença.
- Histórico não é apagado. Posições de `moto peças` não comprovam posições de
  `motopeças Varginha`; são consultas diferentes.

## Comparação manual

Foi aberta uma janela anônima real do Chrome e acessado o Maps pela interface.
Sem cidade, a consulta retornou empresas de outra região. Com
`motopeças Varginha`, o mapa passou a mostrar Varginha e os seis resultados
exibidos começaram por VARGINHA MOTO PEÇAS, Parada motos Varginha e Moremoto.
O Maps informou “visualização limitada”. A Terremoto não estava nesses seis:
isso não comprova ausência nos primeiros 20, nem uma posição numérica diferente.
Não houve login ou alteração da localização do navegador nessa comparação.

## Testes

96 testes principais aprovados. Regressões cobrem cidade em todos os segmentos,
bairros, serviços e marca, além dos clusters e do vocabulário de motopeças.
Integração Firebase aprovada em emuladores, incluindo a rota de sugestões com a
cidade da ficha. Não são medições reais de ranking.
