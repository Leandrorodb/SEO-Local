# INSTRUÇÃO MESTRA — MIGRAÇÃO FIEL DO NEXUS LOCAL RANK TRACKER PARA GOOGLE AI STUDIO BUILD

Você está trabalhando no repositório ORIGINAL do NEXUS Local Rank Tracker v1.2. Não comece um projeto fictício. PRIMEIRO LEIA TODOS OS ARQUIVOS ORIGINAIS antes de gerar mudanças: `README.md`, `ARQUITETURA.md`, `src/server.js`, `src/db.js`, `src/services/{measurement,import,report,keywords}.js`, `public/{index.html,app.js,styles.css}`, `data/{jares-seed,jares-2-unidades}.json`, `scripts/import-result.js` e `tests/*.test.js`.

## Missão
Transformar o sistema local em um aplicativo web **full-stack real, profissional, responsivo e editável no AI Studio**, preservando as funções verificadas no legado, adaptando o frontend legado (HTML, JavaScript de DOM e CSS) a React + TypeScript e adaptando o backend sem descartar regras importantes. O objetivo é que eu possa moldar a UI e as funcionalidades diretamente pelo Build do AI Studio. Implemente, não entregue apenas um documento, pseudocódigo ou um dashboard falso.

## Estado atual e verdade dos dados
- O projeto original usa Node 22, `node:sqlite`, Playwright para Chrome local, HTTP nativo, HTML/CSS/JS puro e scripts `.bat` de Windows.
- Já existem 5 fichas de exemplo cadastráveis com **160 termos**: 3 em `data/jares-seed.json` (84 termos) e 2 em `data/jares-2-unidades.json` (76 termos). Importar pelo CID e preservar as cidades.
- Os JSONs de seed possuem **consultas e clusters**, NÃO posições de ranking. Nunca inventar 1º, 2º, 3º, ou números históricos.
- As 84 medições anteriores das três primeiras Jares estão em outro arquivo `resultado.zip` no computador do usuário, **não neste repositório**. Habilite upload de CSV e evidências para importação. Não simule rankings reais na tela de produção.
- O código original possui **13 testes automatizados aprovados** no ambiente local. Não quebre as regras de correspondência por CID, filtragem de patrocinados e confirmação humana.
- O antigo servidor ouvindo apenas em `127.0.0.1:4177` NÃO é diretamente adequado ao preview/deploy do AI Studio. Não tente rodar duas aplicações competindo por portas.

## Arquitetura obrigatória: nuvem + coletor local
1. **Frontend**: Vite + React + TypeScript, CSS profissional (pode preservar tokens visuais/identidade de `public/styles.css`), navegação e componentes bem separados. Telas: Visão geral, Empresas, Termos & Clusters, Medições, Histórico, Evidências, Feedbacks, Importações e Configurações. Experiência mobile/desktop e estados vazios honestos.
2. **Backend**: Node.js server-side no AI Studio com endpoints /api, validação de entradas, autenticação e autorização. Nunca confiar em `companyId`, `orgId` ou `position` do frontend. Preserve os contratos do servidor legado sempre que praticável.
3. **Persistência**: no ambiente AI Studio/Cloud Run, NÃO usar SQLite ou disco local como armazenamento definitivo (pode ser efêmero). Usar Firestore com Firebase Auth, se disponível, em coleções `/organizations/{orgId}/companies/{companyId}/terms/{termId}`, `/runs/{runId}` e `/measurements/{measurementId}` por organização, mantendo isolamento multi-tenant em todas as operações. Se Firebase não estiver provisionado ou as credenciais faltarem, exiba estado de configuração pendente claramente; NÃO apresente dados falsos nem indique salvamento durável se não houver.
4. **Coletor**: Playwright com Chrome visível foi desenhado para rodar **no Windows local**. Mantenha-o no repositório em `collector-local/` e **não coloque o Chrome com interface gráfica diretamente no frontend nem prometa que funcionará no preview do AI Studio**. No painel web: criar fila de tarefas, exportar payload de termos para o coletor, importar resultados de CSV/ZIP, status do agente conectado ou offline. Na primeira entrega, a integração via arquivo manual já deve funcionar; conexão via API autenticada é evolução opcional.
5. **Evidências**: prints são dados anexos privados; guardar via armazenamento apropriado e vincular a termo, run, posição, coordenadas, momento da coleta, fonte, confiança e status. Jamais aceitar o caminho de arquivo enviado pelo cliente como URL de acesso arbitrário.
6. **Segurança**: Google Sign-In via Firebase, backend verifica ID token com Firebase Admin, RBAC admin/consultor/leitor, isolamento por orgId, validação de payloads, limites de upload e rate limiting. Não embutir credenciais no código do cliente. LGPD e trilha de auditoria.

## Critérios de classificação e medição
- `VERIFIED`: somente correspondência exata por CID com lista orgânica ordenada e evidência.
- `REVIEW`: identificação somente por nome ou lista ambígua; nunca usar para conquistas nos feedbacks.
- `NO_LIST`, `NOT_FOUND`, `BLOCKED`, `ERROR` e `REJECTED`: NÃO significam primeira posição. Sem dado confiável, exibir `Não aferido`.
- Excluir posições patrocinadas. Não contar abertura direta da ficha como 1º lugar.
- Definir contexto de medição (cidade, coordenadas, raio/zoom, horário, idioma) e alertar sobre variação geográfica.
- Não contornar CAPTCHA, limitar frequência e respeitar regras de acesso; para escala comercial, prever alternativa de provedor licenciado de ranking.
- Top 3, Top 5 e Top 10 são acumulados e devem considerar **somente as medições válidas** da run selecionada. Não somar empresas diferentes sem delimitação.

## Funcionalidades a entregar, nesta ordem
A. **Aplicativo React imediatamente funcional** com layout inspirado na interface original, sidebar, dashboard, busca, filtros e cadastro/lista de empresas. Sem dados de ranking inventados.
B. Importação idempotente dos JSONs de cinco unidades Jares, mantendo CID como identificador de correspondência, com indicador de quantidade de termos e clusters por unidade.
C. CRUD seguro de empresas e termos, geração de clusters por segmento/cidade (reutilizar `src/services/keywords.js`), importação em lote.
D. **Importador real de medições** compatível com o esquema `MEDICOES_JARES.csv` do legado, preservando status, posições, fonte, UID/CID, termos e vínculo com a run; considerar importação ZIP com imagens e manifest; deduplicação de lotes pelo hash do arquivo.
E. Painel de auditoria por unidade: filtro por data/rodada, 1º/2º/3º/Top 5/Top 10, tabela termo-cluster-posição-anterior-variação-status-evidência; sem marcar resultados não verificados como vitórias.
F. Revisão humana de correspondências ambíguas com evidências; histórico de decisão do revisor.
G. **Feedback WhatsApp** editável e copiável para cada cliente, baseado exclusivamente nos resultados comprovados; separar termos conquistados e pesquisas estratégicas `A medir`; exportar CSV.
H. Testes automatizados para importação, CID de unidades diferentes, patrocinados, NO_LIST, cálculo de Top, autenticidade da sessão, idempotência e isolamento entre organizações.

## Identidade e UX
- Nome: **NEXUS Local Rank Tracker**; marca interna: **Atlas | Operação Google**.
- Aparência premium SaaS B2B: sidebar escura, fundo azul-marinho/grafite, detalhes em verde-água, cartões e tipografia legível, tabelas com busca e filtros, excelente usabilidade.
- Não altere marca/nome nem faça redesign genérico sem preservar as funcionalidades originais.
- Visão geral exibe somente indicadores calculados sobre dados persistidos; exibir '0 medições' se não houver medição.
- Mostrar separação clara entre dados medidos, resultados a revisar e oportunidades mapeadas.

## Migração de código
- Preserve uma pasta `legacy/` com os arquivos originais antes de reescrevê-los; converter a interface sem descartar regras de negócio. Pode copiar o legado para dentro de `legacy/` no próprio repo.
- Em `package.json`, ajustar scripts para a execução padrão do AI Studio sem destruir a possibilidade de executar o coletor no Windows.
- Se surgir incompatibilidade entre Playwright e o ambiente de preview, **não comprometer o frontend**: iniciar e manter app React funcional, desativar somente a execução de coletor remoto e instruir uso do agente local.
- Faça migração REAL dos contratos, sem inventar endpoints que retornem dados simulados em modo produção.
- Só declarar recursos concluídos após testes/build e endpoints funcionando; listar claramente os pendentes.

## Entrega
Trabalhe no código deste projeto importado (não apenas na resposta de texto). Ao final, apresente: arquivos criados/modificados, módulos funcionais, limites atuais, testes executados, como conectar Firebase, como enviar a planilha de medições do PC para a nuvem e o passo a passo de operação no AI Studio.
