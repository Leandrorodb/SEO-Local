# Arquivo histórico

`releases/` contém as entregas e guias V3/V4 que antes ocupavam a raiz. Foram preservados para consulta, não como instruções atuais de implantação.

- `README_ATE_V4_7.md`: README anterior com contexto PostgreSQL/OIDC.
- `pnpm-lock.yaml.txt` e `pnpm-workspace.yaml.txt`: snapshots descontinuados; a instalação atual usa npm e o lockfile da raiz. A extensão de texto evita tratá-los como configuração ativa.
- `PUBLICAR_GITHUB_INATIVO.cmd.txt`: publicador antigo que pressupunha repositório privado. Está inativo; não execute nem adapte sem revisar o conteúdo que será publicado.
- Relatórios de testes e entregas descrevem suas datas e ambientes originais.

Arquivos de configuração privada, dados locais, capturas e credenciais não fazem parte deste arquivo. Veja a [documentação atual](../README.md).

`postgresql/` preserva especificação, operação, contrato OpenAPI e decisões da arquitetura anterior. Seus workflows de implantação e imagem também foram arquivados: não aparecem como rotinas ativas do GitHub Actions. As verificações atuais continuam em `.github/workflows/validate.yml` e `firebase-render.yml`.
