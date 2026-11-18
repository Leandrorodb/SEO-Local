# SEO Local — Render + Firestore + coletor local (homologação)

**Estado:** implementação em `desenvolvimento-gemini`. **Não representa deploy operacional, medição comercial homologada ou teste de ponta a ponta em produção.**

## Serviços e limites

- Firebase Hosting: mantém o endereço `https://seo-local-64b17.web.app`; não alterar a produção durante a homologação.
- Firebase Authentication/Firestore: login e dados persistidos por organização, via API com Admin SDK.
- Render Free: executa apenas a API Fastify compilada; **não executa Chrome** e pode hibernar após inatividade.
- Chrome local: processo independente no computador autorizado. Só consulta uma organização por vez, com presença/heartbeat no Firestore. O computador precisa permanecer ligado e conectado.
- O piloto Chrome é experimental, não constitui licença comercial nem garante medição em todas as consultas. Resultados incompletos/divergentes devem continuar inconclusivos.

## Configuração do backend (privada)

O `render.yaml` escolhe o plano gratuito, `RANK_PROVIDER=disabled` e `RANK_QUEUE_MODE=local_collector`.

Configure **somente no painel privado do Render**:
- `OWNER_EMAIL`: e-mail Google verificado do titular.
- `FIREBASE_SERVICE_ACCOUNT`: JSON de credencial da service account gerada e armazenada privadamente (não no Git/chat/frontend).
- `CORS_ALLOWED_ORIGIN`: endereço de hospedagem confiável, padrão `https://seo-local-64b17.web.app`.

Não exponha credenciais em capturas de tela, logs, commits ou links de compartilhamento. O Admin SDK possui privilégios elevados: revise IAM e faça a rotação de chaves expostas.

**Segurança:** o código exige e-mail verificado e MFA para ações administrativas protegidas. Não remover essa exigência para liberar cadastro. O fluxo real de MFA ainda precisa de implantação/teste; sem ele, ações de administrador podem retornar `MFA_REQUIRED`.

## Configuração do coletor (somente no computador autorizado)

Forneça as variáveis abaixo no ambiente privado local; não copie secrets de produção para o Git:

```dotenv
NODE_ENV=development
RANK_PROVIDER=local_chrome_preview
LRT_LOCAL_EVAL=I_ACCEPT_LOCAL_ONLY_EXPERIMENTAL_USE
LRT_COLLECTOR_ORGANIZATION_ID=<ID_EXATO_DA_ORGANIZACAO>
# FIREBASE_SERVICE_ACCOUNT=<JSON_PRIVADO_SOMENTE_NO_PC>
```

Inicie `npm run worker:collector` (ou `npm run worker:collector:once` para uma rodada). A identidade do coletor é restrita a `LRT_COLLECTOR_ORGANIZATION_ID`, e a API só permite enfileirar auditorias quando o heartbeat dessa organização estiver recente. O coletor não deve varrer dados de outras organizações.

A nova fila de resolução usa `resolve_requests` no Firestore. No site, `POST /v1/locations/resolve` devolve `QUEUED` e `requestId`, o frontend consulta `GET /v1/locations/resolve/:requestId` e a confirmação valida o resultado guardado no servidor. URL e identificadores fornecidos pelo cliente, sozinhos, **não** confirmam uma ficha.

## Integração com o site

Depois de validar a API de homologação no Render, configurar `VITE_API_BASE_URL` no build do frontend com a origem HTTPS da API (sem sufixo `/v1`). A publicação no Firebase Hosting exige autorização separada para alterar o ambiente de produção.

Validação mínima antes de publicar:
1. `GET /health` com Firestore acessível — não expõe credenciais.
2. Login Firebase com e-mail verificado, MFA/organização, permissões e isolamento.
3. `GET /v1/provider/status` enquanto o coletor está online e após desligá-lo; sem heartbeat, negar novas auditorias.
4. Identificação real pelo Maps; verificar CID/Place ID, nome e coordenadas, sem confundir centro do mapa com ponto da empresa.
5. Cadastro atômico confirmado, termo aprovado, ponto único, orçamento, fila, duas capturas independentes, resultado `VERIFIED` ou inconclusivo.
6. Revisão do arquivo de prova produzido localmente e da evidência persistida; conferir posição orgânica e anúncios.
7. Histórico, relatório, isolamento de usuário e revogação de acesso.
8. Teste de retorno de hibernação do Render, falha do PC/coletor, timeouts, reconciliação e limites do plano.

**Pendente:** teste de ponta a ponta com Firebase real, configuração privada do Render, funcionamento do MFA e validação independente de evidências. O build/testes automatizados não substituem esses passos.
