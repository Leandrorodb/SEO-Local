export type IdentityConfigIssue =
  | 'MISSING_OIDC_CONFIG'
  | 'INVALID_OIDC_URL'
  | 'PLACEHOLDER_OIDC_AUTHORITY'
  | 'PLACEHOLDER_OIDC_CLIENT';

const PLACEHOLDER_HOST_PATTERNS = [
  'your_identity_provider',
  'your-identity-provider',
  'your_oidc',
  'your-oidc',
  'your_idp',
  'your-idp',
  'change_locally',
  'change_me',
  'changeme',
  'placeholder',
];

const PLACEHOLDER_CLIENT_PATTERNS = [
  'your_client_id',
  'your-client-id',
  'change_me',
  'changeme',
  'placeholder',
];

export function validateOidcConfig(
  authority?: string,
  clientId?: string,
): { configured: boolean; issue: IdentityConfigIssue | null } {
  const trimmedAuthority = authority?.trim() ?? '';
  const trimmedClient = clientId?.trim() ?? '';
  if (!trimmedAuthority || !trimmedClient) {
    return { configured: false, issue: 'MISSING_OIDC_CONFIG' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmedAuthority);
  } catch {
    return { configured: false, issue: 'INVALID_OIDC_URL' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { configured: false, issue: 'INVALID_OIDC_URL' };
  }

  const host = parsed.hostname.toLowerCase();
  if (PLACEHOLDER_HOST_PATTERNS.some((pattern) => host.includes(pattern))) {
    return { configured: false, issue: 'PLACEHOLDER_OIDC_AUTHORITY' };
  }

  const normalizedClient = trimmedClient.toLowerCase();
  if (PLACEHOLDER_CLIENT_PATTERNS.some((pattern) => normalizedClient.includes(pattern))) {
    return { configured: false, issue: 'PLACEHOLDER_OIDC_CLIENT' };
  }

  return { configured: true, issue: null };
}

export function isNetworkFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('fetch')
  );
}

export function formatAuthFetchError(
  error: unknown,
  authority?: string,
  origin?: string,
): string | null {
  if (!isNetworkFetchError(error)) return null;
  const target = authority?.trim() || 'VITE_OIDC_AUTHORITY';
  const callbackOrigin = origin?.trim() || 'a origem atual';
  return `Não foi possível conectar ao provedor de identidade OIDC (${target}). Verifique se o servidor OIDC está acessível pelo navegador e com CORS liberado para ${callbackOrigin}.`;
}

export type ApiSubsystemDatabase = {
  configured: boolean;
  connected: boolean;
  roleVerified: boolean;
  schemaReady: boolean;
  issue: string | null;
  target: string | null;
  message: string;
};

export type ApiSubsystemOidc = {
  configured: boolean;
  issue: string | null;
  issuer: string | null;
  expectedCallback: string | null;
  message: string;
};

export type ApiSubsystemWorker = {
  mode: string;
  provider: string;
  oidcConfigured: boolean;
  message: string;
};

export type ApiHealthState =
  | { status: 'checking' }
  | {
      status: 'ok';
      runtime?: string;
      database?: ApiSubsystemDatabase;
      oidc?: ApiSubsystemOidc;
      worker?: ApiSubsystemWorker;
    }
  | {
      status: 'degraded';
      reason: string;
      runtime?: string;
      database?: ApiSubsystemDatabase;
      oidc?: ApiSubsystemOidc;
      worker?: ApiSubsystemWorker;
      missing: string[];
    }
  | { status: 'unavailable'; reason: string }
  | { status: 'unknown' };

export function parseApiHealthPayload(
  status: number,
  contentType: string | null,
  bodyText: string,
): ApiHealthState {
  const isJson = contentType?.toLowerCase().includes('application/json') ?? false;
  if (!isJson) {
    if (status >= 500) {
      return {
        status: 'unavailable',
        reason: 'API Fastify indisponível ou sem resposta do PostgreSQL.',
      };
    }
    return { status: 'unknown' };
  }

  try {
    const parsed = JSON.parse(bodyText) as {
      status?: string;
      service?: string;
      runtime?: string;
      database?: ApiSubsystemDatabase;
      oidc?: ApiSubsystemOidc;
      worker?: ApiSubsystemWorker;
      missing?: string[];
      error?: { code?: string; message?: string };
    };
    if (status >= 200 && status < 300 && parsed.status === 'ok') {
      return {
        status: 'ok',
        ...(parsed.runtime !== undefined ? { runtime: parsed.runtime } : {}),
        ...(parsed.database !== undefined ? { database: parsed.database } : {}),
        ...(parsed.oidc !== undefined ? { oidc: parsed.oidc } : {}),
        ...(parsed.worker !== undefined ? { worker: parsed.worker } : {}),
      };
    }
    if (parsed.status === 'degraded') {
      const reason =
        parsed.database && !parsed.database.connected
          ? parsed.database.message
          : parsed.oidc && !parsed.oidc.configured
            ? parsed.oidc.message
            : 'Serviços externos obrigatórios ainda não foram configurados.';
      return {
        status: 'degraded',
        reason,
        runtime: parsed.runtime,
        database: parsed.database,
        oidc: parsed.oidc,
        worker: parsed.worker,
        missing: Array.isArray(parsed.missing) ? parsed.missing : [],
      };
    }
    if (parsed.error?.code === 'API_UNAVAILABLE' || status >= 500) {
      return {
        status: 'unavailable',
        reason:
          parsed.error?.message ||
          'API Fastify ou PostgreSQL (DATABASE_URL) indisponível.',
      };
    }
  } catch {
    if (status >= 500) {
      return {
        status: 'unavailable',
        reason: 'API Fastify retornou erro ao verificar /health.',
      };
    }
  }
  return { status: 'unknown' };
}
