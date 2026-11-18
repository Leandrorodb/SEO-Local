# LOCAL RANK TRACKER V4.6 — PROJETO CONSOLIDADO

## Conteúdo desta entrega

Esta é a base **única** que incorpora a V4.5 e a correção transacional do cadastro, sem exigir a aplicação de nenhum dos ZIPs antigos.

Inclui: interface React, API Fastify, banco PostgreSQL com migrações e RLS, autenticação local OIDC para testes, controle de organizações/assinaturas/permissões, cadastro Maps, descoberta assistida de termos, revisão e ativação de clusters, medidor experimental Chrome, ponto único e GeoGrid, histórico, concorrentes, exportação CSV, feedbacks, relatórios PDF, automação e telas de administração.

### Correções nesta consolidação

1. Cadastro e confirmação da ficha numa única transação; reaproveitamento de registro existente sem duplicatas.
2. Categoria real detectada no Maps quando disponível, persistida na ficha e utilizada na sugestão de nicho/termos.
3. Erro controlado `MAPS_LOOKUP_FAILED` em falhas de navegador/rede durante a descoberta, sem apresentar genericamente `INTERNAL_ERROR` para esse caso.
4. Medidor orgânico conservador: CID exato, nome correspondente, janelas de rolagem com continuidade, exclusão de anúncios identificados e captura do cartão específico. Sequência duvidosa ou evidência ausente => **inconclusivo**.
5. Feedbacks e PDF não exibem `nullº` nem posições fictícias: registros sem verificação recebem rótulo **INCONCLUSIVO**.
6. Migração `009_maps_category.sql` preserva a categoria principal para fichas existentes e novas.

## Como abrir no Windows

1. Extraia o ZIP inteiro numa pasta nova (não misture com versões antigas).
2. Entre na pasta `local-rank-tracker`.
3. Clique `ABRIR_LOCAL_RANK_TRACKER.cmd`. Na primeira execução, requer internet para instalar dependências via pnpm e baixar PostgreSQL embarcado, e Chrome instalado.
4. Acesse **Medir empresa**. O cadastro e a medição usam o mesmo banco e o mesmo painel.
5. `VERIFICAR_PROJETO_WINDOWS.cmd` roda build e testes completos para conferência no seu computador.

**Não sobrescreva o diretório `work/` de uma versão anterior sem backup.** A versão nova usa banco local próprio. Para migrar dados, planeje exportação e restauração do PostgreSQL antes de trocar a instalação.

## O que foi de fato validado

- 37 testes de lógica local executados em sequência no ambiente de geração (10 de ranking conservador, 9 de termos, 13 do legado, 3 do iniciador/smoke e 2 de login local).
- 46 arquivos TypeScript/TSX analisados por transpile sintático e todas as referências locais inspecionadas.
- ZIP íntegro, sem segredos, `.env` real ou perfis Chrome de usuários.

## O que NÃO foi validado e impede chamar de produto final

- `pnpm install`, `pnpm build`, testes de integração com Fastify/PostgreSQL e a execução do frontend compilado **neste ambiente**: o registro npm está inacessível (erro DNS `EAI_AGAIN`).
- Medição real no Google Maps com Chrome do Windows do usuário. Alterações de interface e restrições do Maps podem produzir resultados inconclusivos.
- Uma fonte licenciada para coleta comercial de rankings e integrações de cobrança real. A medição Chrome é experimental e o piloto é local, não um serviço SaaS em produção.
- Compatibilidade universal com todos os perfis/links e posições para todos os termos. Não inventar posição é comportamento intencional.

**Critério de aceite para declarar final:** registrar duas fichas reais de nichos distintos apenas pelo link, obter termos pertinentes, medir consultas no Chrome com CID/nome/evidência, abrir histórico e PDF; completar o build, testes de integração e operação contínua no Windows. Sem esses testes, o estado correto é **candidato de homologação**, não produto vendável.
