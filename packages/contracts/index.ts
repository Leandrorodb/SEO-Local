import { z } from 'zod';
export const uuid = z.string().uuid();
export const text = z.string().trim().min(1).max(240);
export const surface = z.enum(['MAPS', 'LOCAL_PACK', 'LOCAL_FINDER']);
export const auditInput = z
  .object({
    gridId: uuid,
    surface,
    language: z
      .string()
      .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
      .default('pt-BR'),
    device: z.enum(['desktop', 'mobile']).default('desktop'),
    maxProviderBudgetUsdMicros: z.number().int().nonnegative().max(1e12),
    dryRun: z.boolean().default(false),
    keywordSelection: z.literal('ACTIVE').default('ACTIVE'),
  })
  .strict();
export type AuditInput = z.infer<typeof auditInput>;
export const locationInput = z
  .object({
    name: text,
    city: text,
    address: text,
    mapsUrl: z.string().max(2000),
    lat: z.number().min(-85).max(85),
    lng: z.number().min(-180).max(180),
    brandId: uuid.optional(),
  })
  .strict();
export const pasteInput = z
  .object({ content: z.string().min(1).max(100000), preview: z.boolean().default(true) })
  .strict();
export const gptPayload = z
  .object({
    schemaVersion: z.literal('1.0'),
    locationRef: uuid,
    language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
    clusters: z
      .array(
        z
          .object({
            name: text,
            intent: z.enum(['commercial', 'navigational', 'informational']),
            terms: z
              .array(
                z
                  .object({
                    keyword: text,
                    priority: z.enum(['high', 'medium', 'low']).default('medium'),
                    kind: z.enum(['commercial', 'brand']),
                  })
                  .strict(),
              )
              .min(1)
              .max(500),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export type RankQuery = {
  term: string;
  keywordId: string;
  kind: 'BRAND' | 'COMMERCIAL';
  cluster: string;
  surface: z.infer<typeof surface>;
  language: string;
  device: 'desktop' | 'mobile';
  lat: number;
  lng: number;
  depth: number;
  cid: string | null;
  placeId: string | null;
  expectedName?: string;
  point: number;
  algorithmVersion: string;
};
