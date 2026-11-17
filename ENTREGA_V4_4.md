# Local Rank Tracker V4.4 — fluxo operacional unificado

## O que mudou
- Nova rota `/measure` (menu **Medir empresa**), também acessível pelo botão principal da visão geral.
- Fluxo em uma página: selecionar/cadastrar ficha Google Maps → descobrir/confirmar identidade → sugerir termos por nicho → revisar/importar/ativar termos → ponto único ou GeoGrid → prévia de custo → auditoria → progresso e resultado.
- Usa exclusivamente as rotas existentes da API Fastify multi-tenant e PostgreSQL; não cria banco SQLite alternativo, não insere posições fictícias, não grava credenciais em código.
- Nenhuma empresa, CID, cidade ou categoria específica é pré-cadastrada no wizard.
- Desabilita a medição antes de confirmar identidade e ativar termos; apresenta fonte indisponível quando aplicável.

## Limitações **reais**
- O botão de geração de termos utiliza 40 nichos determinísticos, não descobre automaticamente todos os serviços do Google Maps nem substitui revisão humana.
- Descoberta da ficha depende de `provider.resolve` operacional e capaz de extrair nome, cidade, endereço, coordenadas e identidade estável.
- A medição Chrome é EXPERIMENTAL LOCAL e pode ser inconclusiva; não constitui integração comercial licenciada nem funciona necessariamente em todos os nichos ou regiões.
- O script de inicialização, o provisionamento e o motor Chrome precisam ser verificados no Windows real.
- O build completo não foi executado neste ambiente devido à ausência das dependências do projeto.
- Para um SaaS pronto para venda faltam homologação integral no Windows, provedor autorizado, hospedagem, faturamento e validação de segurança de produção.

## Como testar (Windows)
1. Em cópia/backup da versão atual, extraia o ZIP. Não substitua `.env` nem `work/` da instalação atual.
2. Execute `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd build`, `pnpm.cmd test`, `pnpm.cmd test:legacy`.
3. Inicie pelo iniciador existente e use o item do menu `Medir empresa`.
4. Faça primeiro um teste controlado com UMA empresa e TRÊS termos. Verifique CID, evidências, resultado e possibilidade de consulta inconclusiva.

**Não declarar como sistema final comercial sem estas verificações.**
