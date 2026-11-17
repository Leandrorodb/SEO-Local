import { UserManager, WebStorageStateStore, InMemoryWebStorage } from 'oidc-client-ts';
import {
  formatAuthFetchError,
  isNetworkFetchError,
  validateOidcConfig,
} from './auth-config';

const authority = import.meta.env.VITE_OIDC_AUTHORITY,
  client = import.meta.env.VITE_OIDC_CLIENT_ID;
const oidcValidation = validateOidcConfig(authority, client);
export const identityConfigured = oidcValidation.configured;
export const identityIssue = oidcValidation.issue;
export const oidcAuthority = authority?.trim() ?? '';
export const identity = identityConfigured
  ? new UserManager({
      authority: oidcAuthority,
      client_id: client!.trim(),
      redirect_uri: location.origin + '/auth/callback',
      post_logout_redirect_uri: location.origin,
      response_type: 'code',
      scope: import.meta.env.VITE_OIDC_SCOPE ?? 'openid profile email',
      automaticSilentRenew: false,
      userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
      stateStore: new WebStorageStateStore({ store: sessionStorage }),
    })
  : null;
let bearer: string | null = null;
export function setBearer(value: string | null) {
  bearer = value;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public requestId?: string,
  ) {
    super(code);
  }
}
const messages: Record<string, string> = {
  API_UNAVAILABLE:
    'A API do Local Rank Tracker não está acessível. Verifique se o servidor integrado e o PostgreSQL (DATABASE_URL) estão iniciados.',
  DATABASE_UNAVAILABLE:
    'O PostgreSQL externo (DATABASE_URL com role restrita lrt_app) não está acessível ou ainda usa valores de exemplo.',
  MIGRATIONS_PENDING:
    'PostgreSQL conectado, mas as tabelas do sistema ainda não foram criadas. Execute npm run db:migrate com MIGRATION_DATABASE_URL.',
  OIDC_NOT_CONFIGURED:
    'A autenticação OIDC do servidor (OIDC_ISSUER, OIDC_JWKS_URL, OIDC_AUDIENCE) ainda não foi configurada.',
  BACKEND_NOT_READY:
    'O backend Fastify aguarda configuração completa do PostgreSQL e do provedor OIDC para liberar rotas /v1.',
  LICENSE_SUSPENDED: 'A licença está suspensa ou o período pago encerrou. Procure o administrador.',
  MFA_REQUIRED: 'Entre novamente usando a verificação em duas etapas.',
  REAUTHENTICATION_REQUIRED: 'Esta ação exige uma autenticação recente. Entre novamente.',
  PROVIDER_UNAVAILABLE:
    'A medição depende de um provedor autorizado. Nenhuma consulta foi executada.',
  IDENTITY_UNCONFIRMED: 'Confirme a identidade da ficha antes de medir.',
  LOCAL_PREVIEW_MAX_100_TASKS: 'O modo local permite até 100 consultas por auditoria. Use 1 ponto para medir vários termos ou 5×5 para GeoGrid.',
  LOCAL_PREVIEW_ONLY_MAPS_DESKTOP_PT_BR: 'O piloto local aceita somente Google Maps, desktop e português do Brasil.',
  USER_NOT_PROVISIONED: 'Seu usuário ainda não foi vinculado pelo proprietário.',
  INVALID_TOKEN: 'Sua sessão expirou. Entre novamente.',
  ROLE_DENIED: 'Seu papel não permite esta operação.',
  TENANT_ACCESS_DENIED: 'Seu acesso a esta organização foi removido.',
  INVALID_INPUT: 'Revise os campos e o formato informado.',
  REVIEW_KEYWORD_FIRST: 'Valide o termo antes de ativá-lo.',
  QUERY_QUOTA_EXCEEDED: 'A cota de consultas do plano foi atingida.',
  REPORT_NOT_APPROVED: 'O relatório precisa de aprovação antes da exportação.',
  LOCATION_IDENTITY_CONFLICT: 'Esta URL já pertence a outra identidade. Confira o link original no Google Maps.',
  MAPS_IDENTITY_MISMATCH: 'O identificador da ficha é diferente do encontrado no link. Não foi possível confirmar com segurança.',
  AMBIGUOUS_IDENTITY: 'Não foi possível confirmar de forma única a ficha selecionada. Tente identificar o link novamente.',
  MAPS_LOOKUP_FAILED: 'O Chrome não conseguiu identificar a ficha no Maps. Verifique o navegador, a internet e o link. Nada foi cadastrado.',
  MAPS_BROWSER_BUSY: 'O Chrome está identificando outra ficha. Tente novamente após a consulta atual.',
  MAPS_BROWSER_START_FAILED: 'O Chrome de coleta não abriu. Confira work/local-chrome-evidence/ultima-identificacao.json.',
  MAPS_NAVIGATION_FAILED: 'O Chrome não conseguiu abrir a ficha no Google Maps. Consulte work/local-chrome-evidence/ultima-identificacao.json.',
  MAPS_DETAILS_INCOMPLETE: 'A ficha abriu, mas faltaram detalhes obrigatórios. Você pode cadastrar manualmente os dados conferidos.',
  MAPS_CONSENT_REQUIRED: 'O Google solicitou consentimento de privacidade no navegador de coleta.',
  MAPS_ACCESS_BLOCKED: 'O Google interrompeu a consulta automática. Nenhuma posição foi registrada.',
  MANUAL_ATTESTATION_LOCAL_ONLY: 'O cadastro confirmado pelo operador só está habilitado no piloto local.',
  MANUAL_ATTESTATION_REQUIRES_CID: 'O link não contém um CID confiável. Copie a URL completa da ficha no Maps, com seu identificador.',
  MANUAL_COORDINATES_MISMATCH: 'As coordenadas informadas estão distantes da localização exata indicada no link do Maps.',

  INTERNAL_ERROR: 'O servidor encontrou um erro ao processar a solicitação. Consulte o registro da API.',
};
export const authErrorText = (e: unknown) =>
  formatAuthFetchError(e, oidcAuthority, location.origin) ?? errorText(e);

export const errorText = (e: unknown) =>
  e instanceof ApiError
    ? (messages[e.code] ?? e.code) + (e.code === 'INTERNAL_ERROR' && e.requestId
      ? ` (solicitação ${e.requestId})` : '')
    : isNetworkFetchError(e)
      ? messages.API_UNAVAILABLE
      : e instanceof Error
        ? e.message
        : 'Não foi possível concluir a operação.';
export async function api<T>(
  url: string,
  org: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
  key?: string,
): Promise<T> {
  const response = await fetch('/v1' + url, {
    method,
    headers: {
      ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}),
      ...(org ? { 'X-Organization-Id': org } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'Idempotency-Key': key ?? crypto.randomUUID() } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const value = await response.json().catch(() => ({ error: { code: 'NETWORK_ERROR' } }));
    throw new ApiError(response.status, value.error?.code ?? 'REQUEST_FAILED', value.error?.requestId);
  }
  return (await response.json()).data;
}
export async function downloadPdf(id: string, org: string) {
  const response = await fetch('/v1/reports/' + id + '/pdf', {
    headers: { Authorization: 'Bearer ' + bearer, 'X-Organization-Id': org },
  });
  if (!response.ok) {
    const b = await response.json();
    throw new ApiError(response.status, b.error.code);
  }
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Local-Rank-Tracker.pdf';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
