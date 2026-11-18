# Local Rank Tracker — comece pelo piloto local gratuito

**Base de engenharia:** PostgreSQL + Fastify + React + worker.
**O que esta versão adiciona:** adaptador experimental de Chrome, identificação da ficha com auxílio da URL, limite de 25 consultas por auditoria, prévia de custo API zero e rotulagem correta dos resultados experimentais.

> **Ainda não é um SaaS publicado ou pronto para vender.** Esta versão roda em homologação local. O código do Chrome é experimental e depende da interface e das condições de acesso do Google Maps. Não há contorno de CAPTCHA, proxy, rotação de perfis ou mecanismos de bloqueio.

## 1. Requisitos

- Windows com Node.js 22.14+ e `pnpm` compatível com o `package.json`;
- Google Chrome instalado e **visível na sessão do Windows**;
- PostgreSQL local (o projeto oferece `pnpm db:local`);
- provedor de identidade OIDC com MFA configurado, usuário provisionado e licença de teste ativa, conforme o `README.md` original;
- conexão com a internet para instalar as dependências e acessar serviços externos.

## 2. Preparação (uma única vez)

Na pasta do projeto, instale as dependências e configure seu `.env` local conforme `README.md`. **Não exponha essas credenciais em screenshots nem no Git**.

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
pnpm.cmd test:legacy
pnpm.cmd test
```

Depois de configurar o PostgreSQL e o login segundo o README, inclua no `.env`:

```dotenv
NODE_ENV=staging
RANK_PROVIDER=local_chrome_preview
LRT_LOCAL_EVAL=I_ACCEPT_LOCAL_ONLY_EXPERIMENTAL_USE
```

`DATABASE_URL` e `MIGRATION_DATABASE_URL` devem continuar apontando para **PostgreSQL local**, nunca para produção. O coletor se recusa a iniciar em modo produção ou com banco remoto. Para desligá-lo, use `RANK_PROVIDER=disabled`.

Execute apenas uma vez, depois de aplicar as migrations no banco de teste:

```powershell
pnpm.cmd preview:enable
```

Esse comando registra o fornecedor experimental no banco local com custo de API igual a zero e retenção de concorrentes igual a zero. Ele **não cria plano, assinatura nem conta**: mantenha o procedimento administrativo seguro do README para isso.

## 3. Abrir o sistema

Em terminais separados na pasta do projeto:

```powershell
pnpm.cmd db:local
```

> Se o PostgreSQL local já está funcionando, não inicie outra instância.

```powershell
pnpm.cmd api
```

```powershell
pnpm.cmd worker
```

```powershell
pnpm.cmd dev
```

Acesse **http://localhost:5173**. Para login, configure OIDC/PKCE/MFA. Não existe usuário ou senha padrão de demonstração.

## 4. Primeiro teste funcional

1. No painel **Empresas e unidades**, cole uma URL do Google Maps, clique em **Buscar dados da ficha** e **Usar esta ficha**. Revise nome, cidade, endereço e coordenadas antes de salvar. Se a identificação automática não retornar candidato, preencha os campos manualmente e deixe a identidade pendente para revisão.
2. Na seção **Termos**, cole termos ou JSON de clusters do GPT. Revise e **ative somente um termo** para o primeiro teste.
3. Crie uma grade **5 × 5**, com 25 pontos, na tela de auditorias. Selecione `MAPS`, `desktop` e `pt-BR`.
4. Faça a pré-checagem. O custo **de API** deve ser **US$ 0**, com **25 consultas**. Confirme a auditoria. O worker abre o Chrome visível no PC para o piloto.
5. Consulte o painel de resultados. Uma posição só será `VERIFIED` quando houver correspondência por identificador estável da ficha e captura completa. As demais serão inconclusivas ou necessitarão revisão.
6. Os registros de revisão são salvos em `work/local-chrome-evidence` (local e privado). A emissão de feedback/PDF continua exigindo aprovação humana no SaaS.

**Importante:** o limite de 25 consultas é uma proteção do piloto. Uma grade 5×5 com 40 palavras significaria 1.000 consultas, portanto esta versão recusará tal tentativa. Para testar uma ficha, use um termo ativo por vez. O plano gratuito não inclui hospedagem, internet, energia ou disponibilidade 24 h. O worker só funciona enquanto a máquina estiver ligada e o processo em execução.

## 5. Segurança e limites

- Não disponibilize este provedor de Chrome como solução comercial licenciada sem verificar os direitos de uso, retenção e redistribuição das informações.
- `provider.demo=true` identifica uma medição **experimental e não homologada**. A interface e os novos relatórios a rotulam como *EXPERIMENTAL*; diferente dos dados puramente *SINTÉTICOS* dos testes.
- O bloqueio do Google interrompe a coleta; o sistema não resolve CAPTCHA nem faz evasão.
- As posições e a identidade da ficha podem ficar inconclusivas em caso de mudança no layout do Maps ou ausência de CID verificável.
- As APIs, auth, MFA e regras de licença permanecem da V3. Não habilite shortcuts de autenticação para "facilitar" o piloto.
- A versão final 100% online precisará de uma fonte permitida de medições, infraestrutura de produção e testes de carga, além de segurança e cobrança validadas.

## 6. Validação independente nesta entrega

- `node --test legacy/tests/*.test.js`: **13 testes aprovados**;
- testes específicos do adaptador, compilados provisoriamente com TypeScript global e rodados com Node: **3 testes aprovados**;
- verificação sintática de arquivos TypeScript/TSX atualizados: **sem erros de sintaxe**;
- **não executados aqui**: build completo, testes de integração PostgreSQL/Chrome do SaaS, login OIDC real, medição atual do Google Maps, instalação via `pnpm` (o registry de pacotes não estava acessível neste ambiente).

Todos os detalhes da arquitetura e do contrato comercial continuam em `docs/` e `README.md`.
