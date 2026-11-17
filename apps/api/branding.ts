import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { z } from 'zod';
import type { Services } from './app.js';
import { administrative, log } from './auth.js';
import { requireThat } from '../../packages/domain/errors.js';
export function validateLogo(base64: string) {
  const bytes = Buffer.from(base64, 'base64');
  requireThat(
    bytes.length > 24 &&
      bytes.length <= 90000 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    422,
    'INVALID_PNG_LOGO',
  );
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  requireThat(
    width > 0 && height > 0 && width <= 1024 && height <= 1024,
    422,
    'LOGO_DIMENSION_LIMIT',
  );
  try {
    const decoded = PNG.sync.read(bytes, { checkCRC: true });
    const sanitized = PNG.sync.write(decoded);
    requireThat(sanitized.length <= 90000, 422, 'LOGO_SIZE_LIMIT');
    return sanitized;
  } catch {
    requireThat(false, 422, 'INVALID_PNG_LOGO');
  }
}
export function registerBranding(app: FastifyInstance, s: Services) {
  app.get('/v1/branding', async (req) => ({
    data: await s.tenant(req, ['org_admin', 'analyst', 'client_viewer'], async (tx, c) => {
      const row = (
        await tx.query('SELECT * FROM organization_branding WHERE organization_id=$1', [c.org])
      ).rows[0];
      return row
        ? { displayName: row.display_name, logoBase64: row.logo_png?.toString('base64') ?? null }
        : null;
    }),
    meta: { requestId: req.id },
  }));
  app.post('/v1/branding', async (req) => ({
    data: await s.tenant(req, ['org_admin'], async (tx, c) => {
      administrative(c.principal, true);
      const b = z
        .object({
          displayName: z.string().trim().min(1).max(120),
          logoBase64: z.string().max(120000).nullable(),
        })
        .strict()
        .parse(req.body);
      const logo = b.logoBase64 ? validateLogo(b.logoBase64) : null;
      await tx.query(
        'INSERT INTO organization_branding(organization_id,display_name,logo_png,logo_hash) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id) DO UPDATE SET display_name=excluded.display_name,logo_png=excluded.logo_png,logo_hash=excluded.logo_hash,updated_at=now()',
        [c.org, b.displayName, logo, logo ? createHash('sha256').update(logo).digest('hex') : null],
      );
      await log(tx, c, 'branding.updated', c.org);
      return { saved: true };
    }),
    meta: { requestId: req.id },
  }));
}
