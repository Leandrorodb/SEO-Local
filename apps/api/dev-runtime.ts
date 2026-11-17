import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { makePool, assertRuntimeRole } from '../../packages/db/index.js';
import { productionProvider } from '../../packages/rank-providers/index.js';
import { Authenticator } from './auth.js';
import { buildApp } from './app.js';
import {
  buildMissingRequirementsList,
  collectRuntimeOrigins,
  inspectDatabaseConfig,
  inspectServerOidcConfig,
  inspectWorkerAndProviderConfig,
  type HealthReport,
  type HealthSubsystemDatabase,
  type HealthSubsystemOidc,
  type HealthSubsystemWorker,
} from './runtime-config.js';

export type BackendRuntimeOptions = {
  env?: Record<string, string | undefined>;
  retryCooldownMs?: number;
};

function describeDatabaseError(error: unknown, target: string | null): { issue: string; message: string } {
  const err = error as Error & { code?: string };
  const code = err?.code ?? '';
  const rawMessage = err?.message ?? 'Erro desconhecido';

  if (rawMessage.includes('Unsafe database role')) {
    return {
      issue: 'UNSAFE_DB_ROLE',
      message:
        'A role configurada em DATABASE_URL tem privilégios administrativos (superuser, BYPASSRLS ou dona de tabelas). Use a role restrita lrt_app.',
    };
  }
  if (code === 'ECONNREFUSED' || code === 'ENOENT') {
    return {
      issue: 'DATABASE_UNREACHABLE',
      message: `PostgreSQL indisponível em ${target ?? 'DATABASE_URL'} (${code}). Inicie ou conecte uma instância PostgreSQL acessível.`,
    };
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return {
      issue: 'DATABASE_HOST_NOT_FOUND',
      message: `Não foi possível resolver o host do PostgreSQL (${target ?? code}).`,
    };
  }
  if (code === 'ETIMEDOUT' || rawMessage.toLowerCase().includes('timeout')) {
    return {
      issue: 'DATABASE_TIMEOUT',
      message: `Tempo limite excedido ao conectar ao PostgreSQL (${target ?? 'DATABASE_URL'}).`,
    };
  }
  if (code === '28P01' || code === '28000') {
    return {
      issue: 'DATABASE_AUTH_FAILED',
      message:
        'Falha de autenticação ou role sem permissão de LOGIN no PostgreSQL. Após db:migrate, execute ALTER ROLE lrt_app WITH LOGIN PASSWORD ...',
    };
  }
  if (code === '3D000') {
    return {
      issue: 'DATABASE_NOT_FOUND',
      message: `Banco de dados informado em DATABASE_URL não existe (${target ?? '3D000'}).`,
    };
  }
  return {
    issue: code || 'DATABASE_ERROR',
    message: `Falha ao validar conexão PostgreSQL (${code || rawMessage}).`,
  };
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown) {
  if (res.headersSent) return;
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function requestOriginFromHeaders(req: IncomingMessage): string | undefined {
  const host = req.headers.host;
  if (!host) return undefined;
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader)
    ? protoHeader[0]
    : protoHeader?.split(',')[0]?.trim() || 'http';
  return `${proto}://${host}`;
}

export class BackendRuntime {
  private env: Record<string, string | undefined>;
  private retryCooldownMs: number;
  private pool: pg.Pool | null = null;
  private fastify: FastifyInstance | null = null;
  private initPromise: Promise<void> | null = null;
  private lastAttemptAt = 0;

  private databaseState: HealthSubsystemDatabase = {
    configured: false,
    connected: false,
    roleVerified: false,
    schemaReady: false,
    issue: 'INITIALIZING',
    target: null,
    message: 'Verificando conexão PostgreSQL...',
  };
  private oidcState: HealthSubsystemOidc = {
    configured: false,
    issue: 'INITIALIZING',
    issuer: null,
    expectedCallback: null,
    message: 'Verificando configuração OIDC...',
  };
  private workerState: HealthSubsystemWorker = {
    mode: 'disabled',
    provider: 'disabled',
    oidcConfigured: false,
    message: 'Verificando provedor e worker...',
  };
  private missingList: string[] = [];

  constructor(options: BackendRuntimeOptions = {}) {
    this.env = options.env ?? process.env;
    this.retryCooldownMs = options.retryCooldownMs ?? 5000;
  }

  get ready(): boolean {
    return this.fastify !== null && this.pool !== null;
  }

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.runInitialize().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async runInitialize(): Promise<void> {
    this.lastAttemptAt = Date.now();
    await this.teardown();

    const dbCheck = inspectDatabaseConfig(this.env);
    const oidcCheck = inspectServerOidcConfig(this.env);
    const workerCheck = inspectWorkerAndProviderConfig(this.env);

    this.oidcState = {
      configured: oidcCheck.configured,
      issue: oidcCheck.issue,
      issuer: oidcCheck.issuer,
      expectedCallback: oidcCheck.expectedCallback,
      message: oidcCheck.message,
    };
    this.workerState = {
      mode: workerCheck.mode,
      provider: workerCheck.provider,
      oidcConfigured: workerCheck.workerHttpOidcConfigured,
      message: workerCheck.message,
    };

    let candidatePool: pg.Pool | null = null;
    let dbConnected = false;
    let roleVerified = false;
    let schemaReady = false;
    let dbIssue: string | null = dbCheck.issue;
    let dbMessage = dbCheck.message;

    if (dbCheck.configured && this.env.DATABASE_URL) {
      candidatePool = makePool(this.env.DATABASE_URL);
      candidatePool.on('error', () => {
        // Prevent uncaught EventEmitter crashes from idle pool drops.
      });
      try {
        await candidatePool.query('SELECT 1');
        dbConnected = true;
        await assertRuntimeRole(candidatePool);
        roleVerified = true;
        const schemaCheck = await candidatePool.query<{ ready: boolean }>(
          "SELECT to_regclass('public.organizations') IS NOT NULL AS ready",
        );
        schemaReady = Boolean(schemaCheck.rows[0]?.ready);
        if (!schemaReady) {
          dbIssue = 'MIGRATIONS_PENDING';
          dbMessage = `PostgreSQL conectado (${dbCheck.target}), mas as tabelas ainda não existem. Execute npm run db:migrate com MIGRATION_DATABASE_URL.`;
        } else {
          dbIssue = null;
          dbMessage = `PostgreSQL conectado e validado com role restrita lrt_app (${dbCheck.target}).`;
        }
      } catch (error) {
        const described = describeDatabaseError(error, dbCheck.target);
        dbIssue = described.issue;
        dbMessage = described.message;
      }
    }

    this.databaseState = {
      configured: dbCheck.configured,
      connected: dbConnected,
      roleVerified,
      schemaReady,
      issue: dbIssue,
      target: dbCheck.target,
      message: dbMessage,
    };

    this.missingList = buildMissingRequirementsList(this.databaseState, this.oidcState, dbCheck);

    let auth: Authenticator | null = null;
    if (oidcCheck.configured) {
      try {
        auth = Authenticator.fromEnv(this.env);
      } catch (error) {
        this.oidcState = {
          ...this.oidcState,
          configured: false,
          issue: 'OIDC_INIT_ERROR',
          message: error instanceof Error ? error.message : 'Falha ao inicializar OIDC.',
        };
      }
    }

    let provider;
    try {
      provider = productionProvider(this.env);
    } catch (error) {
      this.workerState = {
        ...this.workerState,
        message: error instanceof Error ? error.message : 'Provedor de ranking inválido.',
      };
      provider = null;
    }

    if (candidatePool && dbConnected && roleVerified && schemaReady && auth && provider) {
      const runtimeOrigins = collectRuntimeOrigins(this.env);
      const mergedWebOrigin = [this.env.WEB_ORIGIN, ...runtimeOrigins].filter(Boolean).join(',');
      const fastify = buildApp({
        pool: candidatePool,
        auth,
        provider,
        logging: true,
        webOrigin: mergedWebOrigin,
      });
      await fastify.ready();
      this.pool = candidatePool;
      this.fastify = fastify;
    } else if (candidatePool) {
      await candidatePool.end().catch(() => {});
    }
  }

  private async maybeRecoverFromTransientError(): Promise<void> {
    if (this.ready) return;
    const dbCheck = inspectDatabaseConfig(this.env);
    const oidcCheck = inspectServerOidcConfig(this.env);
    if (!dbCheck.configured || !oidcCheck.configured) return;
    if (Date.now() - this.lastAttemptAt < this.retryCooldownMs) return;
    await this.initialize();
  }

  async getHealthReport(requestOrigin?: string): Promise<HealthReport> {
    await this.maybeRecoverFromTransientError();

    if (this.ready && this.pool) {
      try {
        await this.pool.query('SELECT 1');
      } catch (error) {
        const described = describeDatabaseError(error, this.databaseState.target);
        this.databaseState = {
          ...this.databaseState,
          connected: false,
          issue: described.issue,
          message: described.message,
        };
        await this.teardown();
      }
    }

    const expectedCallback = requestOrigin
      ? `${requestOrigin.replace(/\/+$/, '')}/auth/callback`
      : this.oidcState.expectedCallback;

    const oidcSnapshot: HealthSubsystemOidc = {
      ...this.oidcState,
      expectedCallback,
    };

    const ok =
      this.ready &&
      this.databaseState.connected &&
      this.databaseState.roleVerified &&
      this.databaseState.schemaReady &&
      oidcSnapshot.configured;

    return {
      status: ok ? 'ok' : 'degraded',
      service: 'Local Rank Tracker',
      runtime: 'integrated-dev',
      api: {
        ready: this.ready,
        mode: this.ready ? 'fastify' : 'degraded-guard',
      },
      database: this.databaseState,
      oidc: oidcSnapshot,
      worker: this.workerState,
      missing: this.missingList,
    };
  }

  async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    const origin = requestOriginFromHeaders(req);

    if (pathname === '/health') {
      const report = await this.getHealthReport(origin);
      writeJson(res, report.status === 'ok' ? 200 : 503, report);
      return;
    }

    await this.maybeRecoverFromTransientError();

    if (this.ready && this.fastify) {
      this.fastify.routing(req, res);
      return;
    }

    const report = await this.getHealthReport(origin);
    const code = !report.database.configured || !report.database.connected
      ? 'DATABASE_UNAVAILABLE'
      : !report.database.schemaReady
        ? 'MIGRATIONS_PENDING'
        : !report.oidc.configured
          ? 'OIDC_NOT_CONFIGURED'
          : 'BACKEND_NOT_READY';

    const message =
      code === 'DATABASE_UNAVAILABLE'
        ? report.database.message
        : code === 'MIGRATIONS_PENDING'
          ? report.database.message
          : report.oidc.message;

    writeJson(res, 503, {
      error: {
        code,
        message,
        missing: report.missing,
        database: report.database,
        oidc: report.oidc,
      },
    });
  }

  async teardown(): Promise<void> {
    if (this.fastify) {
      const app = this.fastify;
      this.fastify = null;
      await app.close().catch(() => {});
    }
    if (this.pool) {
      const pool = this.pool;
      this.pool = null;
      await pool.end().catch(() => {});
    }
  }
}
