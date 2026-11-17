import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { auditInput, locationInput, pasteInput } from './index.js';
export function captureOpenApi(app: FastifyInstance) {
  const registerConfirmed = z.object({ mapsUrl: z.string().trim().min(1).max(2000), externalId: z.string().trim().min(1).max(240) }).strict();
  const document = {
    openapi: '3.1.0',
    info: {
      title: 'Local Rank Tracker API',
      version: '3.0.0-dev',
      description:
        'All business routes validate signed identity, live membership, role, entitlement and location ACL. Production measurements remain provider-gated.',
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    },
    paths: {} as Record<string, Record<string, unknown>>,
  };
  app.decorate('openApiDocument', document);
  app.addHook('onRoute', (route) => {
    if (!route.url.startsWith('/v1/')) return;
    const uri = route.url
      .replaceAll('::', '\uE000')
      .replace(/:([a-zA-Z][a-zA-Z0-9_]*)/g, '{$1}')
      .replaceAll('\uE000', ':');
    for (const method of Array.isArray(route.method) ? route.method : [route.method]) {
      if (method === 'HEAD') continue;
      const parameters: Record<string, unknown>[] = [...uri.matchAll(/\{([^}]+)\}/g)].map((m) => ({
        name: m[1],
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      }));
      if (
        !uri.startsWith('/v1/platform/') &&
        !['/v1/organizations', '/v1/me/organizations', '/v1/webhooks/billing'].includes(uri)
      )
        parameters.push({
          name: 'X-Organization-Id',
          in: 'header',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        });
      if (
        method !== 'GET' &&
        (uri.endsWith('/audits') || uri.endsWith('/license') || uri === '/v1/organizations')
      )
        parameters.push({
          name: 'Idempotency-Key',
          in: 'header',
          required: true,
          schema: { type: 'string', minLength: 8, maxLength: 128 },
        });
      if (method === 'POST' && uri === '/v1/audit-schedules')
        parameters.push({
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          description:
            'Required when startNow is true; reuse the key for all retries of this configuration.',
          schema: { type: 'string', minLength: 8, maxLength: 128 },
        });
      const schema =
        method === 'POST'
          ? uri === '/v1/locations'
            ? locationInput
            : uri === '/v1/locations/register-confirmed'
              ? registerConfirmed
            : uri.endsWith('/keywords:paste')
              ? pasteInput
              : uri.endsWith('/audits')
                ? auditInput
                : null
          : null;
      document.paths[uri] ??= {};
      document.paths[uri][method.toLowerCase()] = {
        operationId: method.toLowerCase() + uri.replace(/[^a-zA-Z0-9]+/g, '_'),
        security: [{ bearerAuth: [] }],
        parameters,
        ...(schema
          ? {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: z.toJSONSchema(schema) } },
              },
            }
          : {}),
        responses: {
          '200': { description: 'Successful data envelope with requestId' },
          '201': { description: 'Created' },
          '202': { description: 'Queued' },
          '401': { description: 'Invalid identity' },
          '402': { description: 'Suspended license or budget exceeded' },
          '403': { description: 'Membership/role/MFA denied' },
          '404': { description: 'Resource not in authorized scope' },
          '409': { description: 'Conflict, stale version or invalid transition' },
          '422': { description: 'Validation failed' },
          '429': { description: 'Quota or request rate exceeded' },
          '503': { description: 'External integration disabled/unavailable' },
        },
      };
    }
  });
  return document;
}
