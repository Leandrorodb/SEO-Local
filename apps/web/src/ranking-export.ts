import type { Rank } from './types';

/** Spreadsheet-safe UTF-8 CSV. No invented ranks: inconclusive positions remain empty. */
export function rankingCsv(rows: Rank[]): string {
  const cell = (value: string | number | null | undefined) => {
    let raw = value == null ? '' : String(value).replace(/\r?\n/g, ' ');
    // Protect Excel/LibreOffice from executing formulas in data from search terms.
    if (/^[\s\t]*[=+@-]/.test(raw) && typeof value !== 'number') raw = "'" + raw;
    return '"' + raw.replace(/"/g, '""') + '"';
  };
  const fields: (keyof Rank | string)[] = [
    'Termo', 'Cluster', 'Superficie', 'Tipo', 'Latitude', 'Longitude',
    'Posicao organica', 'Status', 'Data da medicao', 'Provedor', 'Origem experimental',
  ];
  const lines = [fields.map(cell).join(';')];
  for (const r of rows) {
    lines.push([
      r.query_snapshot.term, r.query_snapshot.cluster, r.query_snapshot.surface,
      r.query_snapshot.kind, r.query_snapshot.lat, r.query_snapshot.lng,
      r.status === 'VERIFIED' ? r.position : null, r.status, r.observed_at,
      r.provider, r.provider === 'local_chrome_preview' ? 'SIM' : r.is_demo ? 'DEMO' : 'NAO',
    ].map(cell).join(';'));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
export function downloadRankingCsv(rows: Rank[]) {
  const blob = new Blob([rankingCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'local-rank-tracker-medicoes.csv';
    document.body.append(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}
