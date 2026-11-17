const PLACEHOLDER_TOKENS = [
  'change_locally',
  'change_me',
  'changeme',
  'your_identity_provider',
  'your-identity-provider',
  'your_oidc',
  'your-oidc',
  'your_idp',
  'your-idp',
  'your_worker',
  'your-worker',
  'your_client_id',
  'your-client-id',
  'your_db',
  'your-db',
  'placeholder',
];

export type DatabaseConfigCheck = {
  configured: boolean;
  issue:
    | 'MISSING_DATABASE_URL'
    | 'INVALID_DATABASE_URL'
    | 'PLACEHOLDER_DATABASE_URL'
    | null;
  target: string | null;
  migrationConfigured: boolean;
  migrationIssue:
    | 'MISSING_MIGRATION_DATABASE_URL'
    | 'INVALID_MIGRATION_DATABASE_URL'
    | 'PLACEHOLDER_MIGRATION_DATABASE_URL'
    | null;
  migrationTarget: string | null;
  message: string;
};

export type OidcConfigCheck = {
  configured: boolean;
  issue:
    | 'MISSING_OIDC_CONFIG'
    | 'INVALID_OIDC_URL'
    | 'PLACEHOLDER_OIDC_URL'
    | 'JWKS_HTTPS_REQUIRED'
    | null;
  issuer: string | null;
  audience: string | null;
  clientId: string | null;
  mfaConfigured: boolean;
  expectedCallback: string | null;
  message: string;
};

export type WorkerConfigCheck = {
  mode: 'disabled' | 'local_chrome_preview' | 'unsupported';
  provider: string;
  localPreviewActive: boolean;
  workerHttpOidcConfigured: boolean;
  message: string;
};

export type HealthSubsystemDatabase = {
  configured: boolean;
  connected: boolean;
  roleVerified: boolean;
  schemaReady: boolean;
  issue: string | null;
  target: string | null;
  message: string;
};

export type HealthSubsystemOidc = {
  configured: boolean;
  issue: string | null;
  issuer: string | null;
  expectedCallback: string | null;
  message: string;
};

export type HealthSubsystemWorker = {
  mode: string;
  provider: string;
  oidcConfigured: boolean;
  message: string;
};

export type HealthReport = {
  status: 'ok' | 'degraded';
  service: 'Local Rank Tracker';
  runtime: 'integrated-dev' | 'api-only';
  api: {
    ready: boolean;
    mode: 'fastify' | 'degraded-guard';
  };
  database: HealthSubsystemDatabase;
  oidc: HealthSubsystemOidc;
  worker: HealthSubsystemWorker;
  missing: string[];
};

export function isPlaceholderValue(value?: string | null): boolean {
  if (!value) return false;
  const lower = value.trim().toLowerCase();
  return PLACEHOLDER_TOKENS.some((token) => lower.includes(token));
}

export function isLocalDevOidcAllowed(env: Record<string, string | undefined>): boolean {
  const jwks = env.OIDC_JWKS_URL?.trim();
  return (
    env.NODE_ENV === 'development' &&
    env.LRT_LOCAL_OIDC === 'I_UNDERSTAND_LOCAL_TEST_ONLY' &&
    env.OIDC_ISSUER?.trim() === 'http://127.0.0.1:4181' &&
    jwks === 'http://127.0.0.1:4181/jwks'
  );
}

export function sanitizePostgresTarget(rawUrl: string): {
  valid: boolean;
  placeholder: boolean;
  target: string | null;
} {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { valid: false, placeholder: false, target: null };

  const normalizedForParse = trimmed.replace(
    /^(postgres(?:ql)?:\/\/[^/?#]*@)\//i,
    '$1unix-socket.invalid/',
  );

  let parsed: URL;
  try {
    parsed = new URL(normalizedForParse);
  } catch {
    return { valid: false, placeholder: false, target: null };
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    return { valid: false, placeholder: false, target: null };
  }

  const socketHost = parsed.searchParams.get('host');
  const hasUnixSocket = Boolean(socketHost && socketHost.startsWith('/'));
  const isSyntheticSocketHost = parsed.hostname === 'unix-socket.invalid';
  if ((isSyntheticSocketHost || !parsed.hostname) && !hasUnixSocket) {
    return { valid: false, placeholder: false, target: null };
  }

  const placeholder =
    (!isSyntheticSocketHost && isPlaceholderValue(parsed.hostname)) ||
    isPlaceholderValue(decodeSafe(parsed.password)) ||
    isPlaceholderValue(decodeSafe(parsed.username)) ||
    isPlaceholderValue(socketHost);

  const dbName = parsed.pathname.replace(/^\/+/, '') || 'postgres';
  const user = decodeSafe(parsed.username);
  const hostLabel = hasUnixSocket
    ? `socket ${socketHost}`
    : `${parsed.hostname}:${parsed.port || '5432'}`;
  const target = `${hostLabel}/${dbName}${user ? ` (usuário ${user})` : ''}`;

  return { valid: true, placeholder, target };
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function inspectDatabaseConfig(
  env: Record<string, string | undefined>,
): DatabaseConfigCheck {
  const runtimeRaw = env.DATABASE_URL?.trim() ?? '';
  const migrationRaw = env.MIGRATION_DATABASE_URL?.trim() ?? '';

  let migrationConfigured = false;
  let migrationIssue: DatabaseConfigCheck['migrationIssue'] = null;
  let migrationTarget: string | null = null;
  if (!migrationRaw) {
    migrationIssue = 'MISSING_MIGRATION_DATABASE_URL';
  } else {
    const m = sanitizePostgresTarget(migrationRaw);
    migrationTarget = m.target;
    if (!m.valid) migrationIssue = 'INVALID_MIGRATION_DATABASE_URL';
    else if (m.placeholder) migrationIssue = 'PLACEHOLDER_MIGRATION_DATABASE_URL';
    else migrationConfigured = true;
  }

  if (!runtimeRaw) {
    return {
      configured: false,
      issue: 'MISSING_DATABASE_URL',
      target: null,
      migrationConfigured,
      migrationIssue,
      migrationTarget,
      message: 'DATABASE_URL não configurada (necessária com o papel restrito lrt_app).',
    };
  }

  const runtime = sanitizePostgresTarget(runtimeRaw);
  if (!runtime.valid) {
    return {
      configured: false,
      issue: 'INVALID_DATABASE_URL',
      target: null,
      migrationConfigured,
      migrationIssue,
      migrationTarget,
      message: 'DATABASE_URL não é uma URL PostgreSQL válida.',
    };
  }

  if (runtime.placeholder) {
    return {
      configured: false,
      issue: 'PLACEHOLDER_DATABASE_URL',
      target: runtime.target,
      migrationConfigured,
      migrationIssue,
      migrationTarget,
      message: `DATABASE_URL ainda usa valor de exemplo (${runtime.target}). Aponte para um PostgreSQL externo ou Cloud SQL.`,
    };
  }

  return {
    configured: true,
    issue: null,
    target: runtime.target,
    migrationConfigured,
    migrationIssue,
    migrationTarget,
    message: `Credencial PostgreSQL configurada (${runtime.target}).`,
  };
}

export function inspectServerOidcConfig(
  env: Record<string, string | undefined>,
  requestOrigin?: string,
): OidcConfigCheck {
  const issuer = env.OIDC_ISSUER?.trim() ?? '';
  const jwks = env.OIDC_JWKS_URL?.trim() ?? '';
  const audience = env.OIDC_AUDIENCE?.trim() ?? '';
  const viteAuthority = env.VITE_OIDC_AUTHORITY?.trim() ?? '';
  const viteClientId = env.VITE_OIDC_CLIENT_ID?.trim() ?? '';
  const expectedCallback = requestOrigin ? `${requestOrigin.replace(/\/+$/, '')}/auth/callback` : null;

  if (!issuer || !jwks || !audience || !viteAuthority || !viteClientId) {
    return {
      configured: false,
      issue: 'MISSING_OIDC_CONFIG',
      issuer: issuer || null,
      audience: audience || null,
      clientId: viteClientId || null,
      mfaConfigured: Boolean(env.OIDC_MFA_ACR?.trim()),
      expectedCallback,
      message:
        'Defina OIDC_ISSUER, OIDC_JWKS_URL, OIDC_AUDIENCE, VITE_OIDC_AUTHORITY e VITE_OIDC_CLIENT_ID com seu provedor OIDC.',
    };
  }

  let parsedIssuer: URL;
  let parsedJwks: URL;
  let parsedViteAuthority: URL;
  try {
    parsedIssuer = new URL(issuer);
    parsedJwks = new URL(jwks);
    parsedViteAuthority = new URL(viteAuthority);
  } catch {
    return {
      configured: false,
      issue: 'INVALID_OIDC_URL',
      issuer: issuer || null,
      audience,
      clientId: viteClientId,
      mfaConfigured: Boolean(env.OIDC_MFA_ACR?.trim()),
      expectedCallback,
      message: 'OIDC_ISSUER, OIDC_JWKS_URL ou VITE_OIDC_AUTHORITY possui URL inválida.',
    };
  }

  if (
    isPlaceholderValue(parsedIssuer.hostname) ||
    isPlaceholderValue(parsedJwks.hostname) ||
    isPlaceholderValue(parsedViteAuthority.hostname) ||
    isPlaceholderValue(viteClientId) ||
    isPlaceholderValue(audience)
  ) {
    return {
      configured: false,
      issue: 'PLACEHOLDER_OIDC_URL',
      issuer,
      audience,
      clientId: viteClientId,
      mfaConfigured: Boolean(env.OIDC_MFA_ACR?.trim()),
      expectedCallback,
      message: `As variáveis OIDC ainda usam o placeholder de exemplo (${parsedIssuer.hostname}).`,
    };
  }

  const localDev = isLocalDevOidcAllowed(env);
  if (parsedJwks.protocol !== 'https:' && !localDev) {
    return {
      configured: false,
      issue: 'JWKS_HTTPS_REQUIRED',
      issuer,
      audience,
      clientId: viteClientId,
      mfaConfigured: Boolean(env.OIDC_MFA_ACR?.trim()),
      expectedCallback,
      message: 'OIDC_JWKS_URL exige HTTPS fora do modo local de loopback.',
    };
  }

  return {
    configured: true,
    issue: null,
    issuer,
    audience,
    clientId: viteClientId,
    mfaConfigured: Boolean(env.OIDC_MFA_ACR?.trim()),
    expectedCallback,
    message: `OIDC configurado (${issuer}).`,
  };
}

export function inspectWorkerAndProviderConfig(
  env: Record<string, string | undefined>,
): WorkerConfigCheck {
  const provider = env.RANK_PROVIDER?.trim() || 'disabled';
  const localPreviewActive =
    provider === 'local_chrome_preview' &&
    env.NODE_ENV !== 'production' &&
    env.LRT_LOCAL_EVAL === 'I_ACCEPT_LOCAL_ONLY_EXPERIMENTAL_USE';

  const workerVars = [
    env.WORKER_OIDC_ISSUER,
    env.WORKER_OIDC_JWKS_URL,
    env.WORKER_OIDC_AUDIENCE,
    env.WORKER_OIDC_SUBJECT,
  ];
  const workerHttpOidcConfigured = workerVars.every((v) => {
    const trimmed = v?.trim();
    return Boolean(trimmed && !isPlaceholderValue(trimmed));
  });

  if (provider === 'disabled') {
    return {
      mode: 'disabled',
      provider,
      localPreviewActive: false,
      workerHttpOidcConfigured,
      message:
        'RANK_PROVIDER=disabled. Cadastro, termos, grades e auditorias são persistidos no banco; medições aguardam provedor autorizado ou worker externo.',
    };
  }

  if (provider === 'local_chrome_preview') {
    return {
      mode: 'local_chrome_preview',
      provider,
      localPreviewActive,
      workerHttpOidcConfigured,
      message: localPreviewActive
        ? 'local_chrome_preview habilitado (uso experimental local com Chrome visível).'
        : 'local_chrome_preview exige NODE_ENV não-produção, LRT_LOCAL_EVAL e Chrome local em loopback.',
    };
  }

  return {
    mode: 'unsupported',
    provider,
    localPreviewActive: false,
    workerHttpOidcConfigured,
    message: `RANK_PROVIDER=${provider} não possui adaptador comercial instalado.`,
  };
}

export function parseAllowedOrigins(
  webOrigin?: string,
  extraOrigins: string[] = [],
): string | string[] {
  const items = new Set<string>();
  const addOrigin = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    try {
      items.add(new URL(trimmed).origin);
    } catch {
      // ignore invalid origin fragments
    }
  };

  if (webOrigin) {
    for (const part of webOrigin.split(',')) addOrigin(part);
  }
  for (const extra of extraOrigins) addOrigin(extra);

  if (items.size === 0) return 'http://localhost:5173';
  const list = [...items];
  return list.length === 1 ? list[0] : list;
}

export function collectRuntimeOrigins(env: Record<string, string | undefined>): string[] {
  const origins: string[] = [];
  const port = env.PORT?.trim() || '3000';
  origins.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
  if (env.NG_ALLOWED_HOSTS) {
    for (const host of env.NG_ALLOWED_HOSTS.split(',')) {
      const clean = host.trim();
      if (clean && !clean.includes('*')) {
        origins.push(`https://${clean}`, `http://${clean}`);
      }
    }
  }
  return origins;
}

export function collectHelmetConnectSrc(env: Record<string, string | undefined>): string[] {
  const sources = new Set<string>(["'self'"]);
  for (const candidate of [env.OIDC_ISSUER, env.VITE_OIDC_AUTHORITY, env.OIDC_JWKS_URL]) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (['http:', 'https:'].includes(parsed.protocol)) {
        sources.add(parsed.origin);
      }
    } catch {
      // ignore malformed URL
    }
  }
  if (sources.size === 1) sources.add('https://invalid.local');
  return [...sources];
}

export function buildMissingRequirementsList(
  db: HealthSubsystemDatabase,
  oidc: HealthSubsystemOidc,
  dbCheck: DatabaseConfigCheck,
): string[] {
  const missing: string[] = [];
  if (!db.configured) missing.push('DATABASE_URL');
  else if (!db.connected) missing.push('POSTGRESQL_CONNECTION');
  else if (!db.roleVerified) missing.push('LRT_APP_ROLE_PERMISSIONS');
  else if (!db.schemaReady) missing.push('DB_MIGRATIONS');

  if (!dbCheck.migrationConfigured) missing.push('MIGRATION_DATABASE_URL');
  if (!oidc.configured) {
    missing.push(
      'OIDC_ISSUER',
      'OIDC_JWKS_URL',
      'OIDC_AUDIENCE',
      'VITE_OIDC_AUTHORITY',
      'VITE_OIDC_CLIENT_ID',
    );
  }
  return [...new Set(missing)];
}
