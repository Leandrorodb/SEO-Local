# NEXUS LOCAL RANK TRACKER — v1.1

Painel local para gerenciar fichas de empresas, termos por cluster, medições do Google Maps, resultados com trilha de evidência e feedbacks para WhatsApp. Sem uso de LLM e sem créditos de IA.

## Iniciar no Windows

1. Instale Node.js 22.16+ (recomendado Node 22 LTS ou superior) e Google Chrome.
2. Extraia todo o arquivo ZIP para uma pasta normal do seu computador.
3. Clique em `INICIAR_NEXUS.bat`. Na primeira execução, o sistema instala Playwright via npm (precisa internet apenas nessa etapa).
4. Acesse `http://127.0.0.1:4177`. Se não abrir automaticamente, cole esse endereço no Chrome.
5. É possível importar empresas em lote (colunas `nome;cidade;latitude;longitude;CID`) e depois importar termos ou gerar clusters por nicho.
6. As três fichas **Jares Pouso Alegre, Jares Três Corações e Jares Outlet**, com 84 termos, vêm cadastradas como exemplo operacional.
7. **Revise as coordenadas e o CID** de cada ficha antes de medir. Coordenadas de referência são aproximadas e não representam necessariamente a porta da loja.
8. Na aba Medições, escolha a empresa. Use `✦ Gerar clusters` para criar termos sugeridos sem IA, ou importe termos próprios. Em seguida clique em `Medir pesquisas`. Use P1 para uma coleta curta ou Todos para os demais termos.
9. Uma janela do Chrome é aberta para o Google Maps. Não feche enquanto estiver medindo.
10. Revise os resultados `Revisar` e abra as capturas de tela; confirme apenas quando identidade e posição orgânica forem claras. Depois gere o feedback e copie para WhatsApp.

No Linux/macOS: `npm install` seguido de `npm start`. O Chrome precisa estar instalado no computador ou você deve adaptar `channel:'chrome'` no serviço de coleta.

## Pastas e arquitetura

- `src/db.js`: banco SQLite local, migração inicial e dados.
- `src/server.js`: API HTTP protegida em `127.0.0.1`.
- `src/services/measurement.js`: fila sequencial, navegador Playwright, geolocalização e evidências.
- `src/services/report.js`: geração de feedback e CSV seguro.
- `public/`: interface web responsiva sem dependências frontend.
- `data/jares-seed.json`: matriz inicial das 3 unidades (84 pesquisas).
- `local-data/nexus.sqlite`: banco criado automaticamente **fora do código-fonte**.
- `local-data/evidence`: prints e perfil temporário do Chrome.

**Backup:** copie a pasta `local-data` com o programa fechado. Para manter histórico, não apague essa pasta quando atualizar o sistema.

## Regras de medição

- A consulta é feita a partir de coordenadas de referência por unidade; não existe garantia de mesma posição para toda uma cidade.
- Se o URL de um resultado contém o CID da ficha, é classificado como `Confirmado` (observe que a interface do Google pode alterar os links).
- Correspondências apenas por nome entram como `Revisar`. **Não** aparecem como conquista em relatórios antes de validação humana.
- Uma abertura direta da ficha sem feed ordenado não é interpretada como Top 1.
- Resultados sinalizados como patrocinados não são contabilizados intencionalmente. Mudanças na marcação da interface podem exigir revisão dos prints.
- Se o Google mostrar verificação humana/CAPTCHA, a execução é interrompida. **Não** usa evasão de bloqueios, proxies, rotação de identidades ou quebra de CAPTCHA.
- A coleta é de baixa frequência, sequencial, acionada pelo usuário. Consulte as condições do serviço antes de usar automação em larga escala; para escala comercial, considere uma fonte licenciada de dados de ranking.
- O sistema **não** altera o Perfil da Empresa no Google e **não** envia WhatsApp automaticamente.

## Problemas comuns

**O botão de medir não abre o Chrome:** confira se Google Chrome está instalado, se a tela está desbloqueada e se o terminal mostra algum erro. Use `npm install` para instalar Playwright.

**Aparece `REVIEW` (revisar):** a URL do resultado não provou automaticamente o identificador da ficha. Abra o print e confira antes de confirmar. O rank só será reportado após essa etapa.

**Aparece `NO_LIST`:** o Google Maps não exibiu uma lista comparável ou houve redirecionamento direto. Isso não é evidência de posição 1.

**Aparece `BLOCKED`:** o Google solicitou verificação humana. Interrompa a automação e consulte o serviço; não tente burlar a verificação.

**Não aparece nenhuma posição mesmo com loja presente no Google:** pode haver diferença no nome, no CID, endereço, scroll, sessão do Maps ou localização da busca. Verifique o print antes de confiar em resultados.

## Verificação técnica

`npm test` executa testes de segurança de posição, confirmação por CID, caso sem feed e banco local.

O sistema é um **MVP operacional**, não um SaaS multiusuário pronto para comercialização. Não possui autenticação remota, RBAC, multi-tenant e telemetria de produção. Fica restrito ao `localhost`, com banco local e sem expor dados a terceiros. Para vender como SaaS, separar API, autenticação, isolamento por `orgId`, jobs persistentes, storage privado, auditoria de acessos, limites por tenant e contratação de fonte licenciada de ranking.

## Novidade da v1.1: importar o resultado.zip sem gastar tokens

O primeiro piloto foi executado pelo medidor independente, que exportou `resultado.zip` contendo `MEDICOES_JARES.csv`, imagens e listas de resultados.

1. **Antes de atualizar:** feche a janela de terminal do Nexus e faça backup da pasta `local-data` da versão antiga.
2. Extraia a **v1.1** na pasta onde você deseja manter o sistema. Se preferir instalar em outra pasta, copie sua pasta antiga `local-data` para dentro da nova instalação antes de iniciar o programa.
3. Coloque o `resultado.zip` (gerado pelo medidor) ao lado de `IMPORTAR_RESULTADO.bat`, **ou arraste esse ZIP diretamente para cima do arquivo `.bat`**.
4. Execute `IMPORTAR_RESULTADO.bat`. Uma mesma planilha não será importada duas vezes. O ZIP pode ser grande porque contém prints; o programa preserva as imagens dentro de `local-data/evidence`.
5. Execute `INICIAR_NEXUS.bat` e veja os resultados em **Medições → empresa → histórico de auditorias**. As coletas importadas aparecem identificadas como **Importado**. Em **Feedbacks**, copie os termos com evidência verificada.

**Comando alternativo (terminal):** `node scripts/import-result.js "C:\\caminho\\resultado.zip"`. Também aceita a pasta extraída que contém `MEDICOES_JARES.csv` e `prints`.

**Resultados do piloto de referência:** 84 pesquisas, das quais 60 tiveram posição concordante com o CID nos arquivos de resultados; as demais 24 não foram automaticamente anunciadas como colocação confirmada (10 para revisão e 14 sem posição comparável/localização conclusiva). Isso confirma a integridade da importação dos arquivos fornecidos, **não** é garantia de precisão geográfica em toda a cidade nem de validade de uma captura patrocinada ou desatualizada. Confira os prints antes do envio.

**Se você atualizar sobre uma versão antiga**, mantenha `local-data`: é ali que ficam os dados reais. Não copie a pasta `local-data` de uma instalação nova por cima da antiga. O SQLite recebe uma migração compatível na primeira inicialização da v1.1. Não execute importação simultaneamente a outra coleta.

**Limitação desta versão:** a importação em lote suporta o formato do medidor Jares (`MEDICOES_JARES.csv`). Para outros scripts, será necessário adaptar um importador ou seguir uma interface CSV padronizada em uma versão futura.


## v1.2 — mais duas unidades Jares (Lavras e Varginha)

- Cadastro incremental de Lavras e Varginha (38 termos cada), preservando as três Jares anteriores, medições, histórico e prints.
- As 76 consultas foram importadas da MATRIZ AMPLIADA de 21/10/2026, com 5 clusters por unidade e prioridades Alta/Média/Baixa.
- Execute INICIAR_NEXUS.bat normalmente: as duas empresas aparecem automaticamente no painel, mesmo se voce ja tinha banco v1.1.
- A ferramenta externa MEDIDOR_JARES_LAVRAS_VARGINHA pode executar as 76 buscas de forma independente. Seus resultados sao importáveis no v1.2 usando IMPORTAR_RESULTADO.bat.
- O motor faz medições locais; os 2 primeiros lugares históricos de Lavras e os rankings anteriores de Varginha nao foram importados como medições atuais.
- **Antes de atualizar:** feche o sistema e preserve sua pasta local-data. O ZIP de instalacao nao contem banco nem prints pessoais.
