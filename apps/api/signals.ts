import { z } from 'zod';
import { sliceKey, type Measurement } from './analytics.js';
export const alertRules = z
  .object({
    materialDrop: z.number().int().min(1).max(50).default(3),
    newLeader: z.boolean().default(true),
    repeatedDrop: z.boolean().default(true),
    failure: z.boolean().default(true),
    upcoming: z.boolean().default(true),
    budget: z.boolean().default(true),
  })
  .strict();
type Rules = z.infer<typeof alertRules>;
export type Signal = {
  measurementId: string;
  kind: string;
  term: string;
  delta: number | null;
  observedAt: string;
  isDemo?: boolean;
};
export function signals(history: (Measurement & { delta: number | null })[], rules: Rules) {
  const prior = new Map<string, number | null>();
  const out: Signal[] = [];
  for (const m of history) {
    const key = sliceKey(m);
    const add = (kind: string) =>
      out.push({
        measurementId: m.id,
        kind,
        term: m.query_snapshot.term,
        delta: m.delta,
        observedAt: m.observed_at,
        isDemo: m.is_demo,
      });
    if (m.status === 'VERIFIED' && m.delta !== null) {
      if (m.delta <= -rules.materialDrop) add('MATERIAL_DROP');
      if (rules.newLeader && m.position === 1 && m.delta > 0) add('NEW_TOP_1');
      if (rules.repeatedDrop && m.delta < 0 && (prior.get(key) ?? 0) < 0) add('REPEATED_DROP');
    } else if (
      rules.failure &&
      [
        'ERROR',
        'BLOCKED',
        'PROVIDER_UNAVAILABLE',
        'UNSUPPORTED_SURFACE',
        'PARTIAL_RESULTS',
      ].includes(m.status)
    )
      add('MEASUREMENT_FAILURE');
    prior.set(key, m.delta);
  }
  return out.reverse();
}
export function budgetLevel(used: number, limit: number) {
  if (limit <= 0) return null;
  return [95, 80, 50].find((p) => 100 * used >= p * limit) ?? null;
}
