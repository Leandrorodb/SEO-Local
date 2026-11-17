/** Proof-version gate. Old experimental browser ranks remain in immutable storage,
 * but must never be displayed or exported as VERIFIED after the parser fix.
 */
export const BROWSER_PARSER_VERSION = 'rank-proof-v2';
export type VersionedMeasurement = {
  provider: string;
  parser_version?: string;
  status: string;
  position: number | null;
  identity_match?: string | null;
  [key: string]: unknown;
};

export function trustedMeasurement(m: { provider: string; parser_version?: string }): boolean {
  return m.provider !== 'local_chrome_preview' || m.parser_version === BROWSER_PARSER_VERSION;
}

export function maskLegacyBrowserRank<T extends VersionedMeasurement>(m: T): T & { legacy_unverified?: true } {
  if (trustedMeasurement(m)) return m;
  return { ...m, status: 'REVIEW', position: null, identity_match: null, legacy_unverified: true };
}

export function trustedBrowserReport(content: {
  provider?: string;
  rows?: { provider: string; parser_version?: string }[];
}): boolean {
  if (content.provider !== 'local_chrome_preview') return true;
  return Boolean(content.rows?.length && content.rows.every((row) => trustedMeasurement(row)));
}
