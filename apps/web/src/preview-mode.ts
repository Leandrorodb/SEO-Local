import type { ApiHealthState } from './auth-config';

export const UI_PREVIEW_STORAGE_KEY = 'lrt-aistudio-ui-preview';

const ALLOWED_PREVIEW_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.0\.0\.1$/,
  /^\[?::1\]?$/,
  /\.run\.app$/i,
  /\.web\.app$/i,
];

/**
 * Isolated UI preview is exclusively permitted in development builds served on
 * local or Google AI Studio preview hosts. Production builds must never bypass OIDC.
 */
export function isUiPreviewAllowed(hostname: string, isDev: boolean): boolean {
  if (!isDev) return false;
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return false;
  return ALLOWED_PREVIEW_HOST_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function resolveInitialPreviewMode({
  allowed,
  search,
  storedValue,
}: {
  allowed: boolean;
  search: string;
  storedValue: string | null;
}): boolean {
  if (!allowed) return false;
  const params = new URLSearchParams(search);
  const queryFlag = params.get('preview');
  if (queryFlag === 'ui' || queryFlag === '1') return true;
  if (queryFlag === '0' || queryFlag === 'off') return false;
  return storedValue === '1';
}

export type SetupChecklistItem = {
  id: 'api' | 'database' | 'oidc' | 'worker';
  label: string;
  state: 'ready' | 'pending' | 'checking';
  detail: string;
};

export function buildSetupReadinessChecklist(
  health: ApiHealthState,
  identityConfigured: boolean,
  identityIssue: string | null,
): SetupChecklistItem[] {
  const withSubsystems = health.status === 'ok' || health.status === 'degraded';
  const firebaseRuntime = withSubsystems && health.runtime === 'firebase';
  const db = withSubsystems ? health.database : undefined;
  const serverOidc = withSubsystems ? health.oidc : undefined;
  const worker = withSubsystems ? health.worker : undefined;
  const unavailableReason = health.status === 'unavailable' ? health.reason : undefined;

  const dbReady = Boolean(db?.connected && db?.schemaReady);
  const oidcReady = identityConfigured && (serverOidc ? serverOidc.configured : true);
  const workerReady = Boolean(
    worker?.provider && !['unconfigured', 'disabled', 'none'].includes(worker.provider),
  );

  return [
    {
      id: 'api',
      label: 'API Fastify & Rotas /v1',
      state: health.status === 'checking' ? 'checking' : withSubsystems ? 'ready' : 'pending',
      detail:
        health.status === 'checking'
          ? 'Consultando /health na mesma origem…'
          : withSubsystems
            ? 'Servidor integrado ativo em /v1 com RBAC, MFA e rate limit preservados.'
            : (unavailableReason ?? 'API indisponível.'),
    },
    {
      id: 'database',
      label: firebaseRuntime ? 'Cloud Firestore' : 'PostgreSQL Externo (Neon) & RLS',
      state: health.status === 'checking' ? 'checking' : dbReady ? 'ready' : 'pending',
      detail:
        health.status === 'checking'
          ? 'Verificando pool PostgreSQL…'
          : (db?.message ??
            'Configure DATABASE_URL (role restrita lrt_app) e execute npm run db:migrate com MIGRATION_DATABASE_URL.'),
    },
    {
      id: 'oidc',
      label: firebaseRuntime ? 'Firebase Authentication' : 'Provedor OIDC + PKCE + MFA',
      state: oidcReady ? 'ready' : 'pending',
      detail: oidcReady
        ? firebaseRuntime ? 'Login Google configurado. Operações administrativas exigem verificação em duas etapas.' : 'Credenciais OIDC válidas no cliente e no servidor.'
        : identityIssue === 'PLACEHOLDER_OIDC_AUTHORITY'
          ? 'Substitua os valores de exemplo de VITE_OIDC_AUTHORITY e OIDC_ISSUER pelo seu IdP.'
          : (serverOidc?.message ??
            'Configure VITE_OIDC_AUTHORITY, VITE_OIDC_CLIENT_ID, OIDC_ISSUER, OIDC_JWKS_URL e OIDC_AUDIENCE.'),
    },
    {
      id: 'worker',
      label: 'Worker & Provedor de Medição',
      state: health.status === 'checking' ? 'checking' : workerReady ? 'ready' : 'pending',
      detail:
        health.status === 'checking'
          ? 'Verificando provedor de coleta…'
          : (worker?.message ??
            'Nenhuma posição é simulada em produção; exige fonte autorizada no worker.'),
    },
  ];
}

export type PlanStructureTemplate = {
  code: string;
  title: string;
  target: string;
  highlights: string[];
};

/**
 * Structural plan tiers matching the SaaS domain model without inventing tenant
 * contracts, invoice values, or active subscription quotas.
 */
export const PLAN_STRUCTURE_TEMPLATES: PlanStructureTemplate[] = [
  {
    code: 'STARTER',
    title: 'Operação Essencial',
    target: 'Negócios locais de 1 unidade com auditorias pontuais',
    highlights: [
      'Identidade confirmada por CID / Place ID',
      'Clusters comerciais e de marca com revisão humana',
      'Relatórios auditáveis em PDF e resumo WhatsApp',
    ],
  },
  {
    code: 'AGENCY_PRO',
    title: 'Agência Multi-Unidades',
    target: 'Carteira regional com GeoGrid 5×5 e rotinas recorrentes',
    highlights: [
      'Grades geográficas 5×5 com espaçamento configurável',
      'Controle de orçamento por execução e teto mensal',
      'Marca branca da agência congelada no snapshot do relatório',
    ],
  },
  {
    code: 'ENTERPRISE_NETWORK',
    title: 'Redes & Franquias',
    target: 'Redes multi-marcas com governança OIDC, MFA e RLS por cliente',
    highlights: [
      'Acesso client_viewer isolado por unidade atribuída',
      'Trilha de auditoria administrativa e solicitações LGPD',
      'Política de retenção e reautenticação para alterações contratuais',
    ],
  },
];

export type PreviewGeoGridPoint = {
  sequence: number;
  row: number;
  col: number;
  label: string;
  offsetNorthM: number;
  offsetEastM: number;
};

/**
 * Computes relative 5×5 metric offsets purely for structural GeoGrid visualization
 * when no confirmed business coordinates are loaded yet. Never fabricates lat/lng or ranks.
 */
export function buildRelativeGeoGridLayout(spacingM: number): PreviewGeoGridPoint[] {
  const safeSpacing = Number.isFinite(spacingM) && spacingM >= 50 ? Math.min(spacingM, 10000) : 500;
  const points: PreviewGeoGridPoint[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const sequence = row * 5 + col;
      points.push({
        sequence,
        row,
        col,
        label: `P${sequence + 1}`,
        offsetNorthM: (2 - row) * safeSpacing,
        offsetEastM: (col - 2) * safeSpacing,
      });
    }
  }
  return points;
}
