# Validação de 18/11/2026

O usuário retomou o trabalho. A publicação desta revisão deve ser conferida no
Render e no Firebase; um push sozinho não comprova implantação.

## Correções

- Categoria de oficina de motos recebe sugestões do nicho de motocicletas.
- Cancelamento preserva histórico, impede a segunda captura quando solicitado
  após a primeira e devolve unidades de capturas não iniciadas.
- Reservas canceladas sem captura não viram medições ou cobertura fictícia.
- Tarefas locais interrompidas são encerradas sem repetir pedidos. Pedidos de
  provedores com custo desconhecido continuam exigindo reconciliação.
- Evidências mostram as duas listas, identidade, horário e motivo da decisão.
- Capturas divergentes, incompletas, antigas ou sem identidade permanecem sem
  posição confirmada. Anúncios ficam separados da ordem orgânica.
- CI passa a executar o fluxo Firebase em emuladores, além da suíte principal.

## Verificação local

TypeScript e builds do frontend e Render passaram. Os 94 testes da suíte
principal passaram. A integração com Auth e Firestore emulados passou, incluindo
cancelamento, recuperação, isolamento, idempotência e PDF. As capturas desse teste
são fixtures identificadas; não comprovam uma posição real da empresa.

## Correção de dados do piloto

A auditoria antiga de 23 termos foi cancelada. As 18 tarefas pendentes foram
encerradas sem novas capturas; a tarefa interrompida foi reconciliada. Foram
desativados 21 termos inadequados de automóveis, preservando os dois termos da
marca, as evidências e o histórico. Backup privado mantido fora do Git.

As duas execuções anteriores do GitHub Actions, no commit `16362bf`, passaram.
A causa dos avisos por e-mail era uma dependência vulnerável já atualizada.
As notificações e a auditoria de segurança continuam habilitadas.

## Limites

O coletor depende do computador autorizado ligado. Render Free pode hibernar.
O piloto Chrome é experimental; publicar um número exige duas capturas
independentes concordantes. Não há garantia de posição estável ou primeiro lugar.
Nenhum recurso pago foi contratado.
