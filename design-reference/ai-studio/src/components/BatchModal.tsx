import React, { useState, useMemo } from 'react';
import { X, UploadCloud, Sparkles, CheckCircle2, AlertTriangle, Layers, ListFilter } from 'lucide-react';

interface BatchModalProps {
  type: 'companies' | 'terms';
  companyName?: string;
  onClose: () => void;
  onImport: (text: string) => Promise<void>;
}

export function parseGptTerms(content: string) {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  const seen = new Set<string>();
  const terms: { query: string; cluster: string; priority: 'P1' | 'P2' | 'P3' }[] = [];
  let duplicates = 0;

  // Case 1: JSON
  if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
    try {
      const data = JSON.parse(content);
      const clusters = Array.isArray(data)
        ? data
        : data.clusters || [{ name: 'Geral', terms: data.terms || [] }];
      for (const cl of clusters) {
        const clusterName = cl.name || 'Geral';
        const clTerms = cl.terms || [];
        for (const t of clTerms) {
          const q = typeof t === 'string' ? t.trim() : (t.keyword || t.query || '').trim();
          const p = String(t.priority || 'P2').toUpperCase();
          const priority = ['P1', 'P2', 'P3'].includes(p) ? (p as 'P1' | 'P2' | 'P3') : 'P2';
          if (!q) continue;
          const key = norm(q);
          if (seen.has(key)) {
            duplicates++;
          } else {
            seen.add(key);
            terms.push({ query: q, cluster: clusterName, priority });
          }
        }
      }
      return { terms, duplicates };
    } catch {}
  }

  // Case 2: Markdown or text with # Clusters or line-by-line
  let currentCluster = 'Geral';
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.startsWith('#')) {
      currentCluster = line.replace(/^#+\s*/, '').trim() || 'Geral';
      continue;
    }
    // Check if line is CSV: query;cluster;priority
    if (line.includes(';')) {
      const [q, cl, pr] = line.split(';');
      const cleanQ = q.trim();
      const cleanCl = cl?.trim() || currentCluster;
      const cleanPr = (pr?.trim().toUpperCase() || 'P2') as 'P1' | 'P2' | 'P3';
      if (!cleanQ) continue;
      const key = norm(cleanQ);
      if (seen.has(key)) {
        duplicates++;
      } else {
        seen.add(key);
        terms.push({
          query: cleanQ,
          cluster: cleanCl,
          priority: ['P1', 'P2', 'P3'].includes(cleanPr) ? cleanPr : 'P2',
        });
      }
    } else {
      // Plain line term from bullet or plain text
      const cleanQ = line.replace(/^[-*•\d+.)]\s*/, '').trim();
      if (!cleanQ) continue;
      const key = norm(cleanQ);
      if (seen.has(key)) {
        duplicates++;
      } else {
        seen.add(key);
        terms.push({ query: cleanQ, cluster: currentCluster, priority: 'P2' });
      }
    }
  }

  return { terms, duplicates };
}

export const BatchModal: React.FC<BatchModalProps> = ({
  type,
  companyName,
  onClose,
  onImport,
}) => {
  const [content, setContent] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const isCompanies = type === 'companies';

  const placeholder = isCompanies
    ? `Loja Exemplo;Três Corações;-21.7;-45.26;abcde1234567890f\nLoja 2;Lavras;-21.25;-44.99;`
    : `# Loja de Móveis\nloja de móveis em Pouso Alegre\ncomprar móveis Pouso Alegre\n\n# Sofás e Estofados\nloja de sofás em Pouso Alegre\nsofá retrátil Pouso Alegre\n\n(Ou cole o JSON gerado diretamente pelo GPT)`;

  const parsedTerms = useMemo(() => {
    if (isCompanies || !content.trim()) return null;
    return parseGptTerms(content);
  }, [content, isCompanies]);

  const clusterList = useMemo(() => {
    if (!parsedTerms) return [];
    return Array.from(new Set(parsedTerms.terms.map((t) => t.cluster)));
  }, [parsedTerms]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setError('');
    setImporting(true);
    try {
      if (isCompanies) {
        await onImport(content.trim());
      } else {
        // Pass parsed terms as CSV formatted lines
        if (parsedTerms && parsedTerms.terms.length > 0) {
          const formatted = parsedTerms.terms
            .map((t) => `${t.query};${t.cluster};${t.priority}`)
            .join('\n');
          await onImport(formatted);
        } else {
          await onImport(content.trim());
        }
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao importar lote');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              {isCompanies ? <UploadCloud size={18} /> : <Sparkles size={18} />}
            </div>
            <div>
              <div className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">
                {isCompanies ? 'Importação em Lote' : 'Integração GPT · Clusters e Termos'}
              </div>
              <h2 className="text-base font-bold text-slate-900">
                {isCompanies ? 'Importar Várias Empresas' : `Colar Termos do GPT — ${companyName}`}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          )}

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
            <strong>Instrução de colagem:</strong>
            {isCompanies ? (
              <p>
                Cole uma empresa por linha com colunas separadas por ponto e vírgula:
                <br />
                <code className="text-teal-700 font-mono">nome;cidade;latitude;longitude;CID</code> (CID é opcional).
              </p>
            ) : (
              <p>
                Cole a resposta do ChatGPT em <span className="font-semibold text-slate-800">Texto formatado (# Cluster e linhas de termos)</span> ou em <span className="font-semibold text-slate-800">JSON</span>. O sistema organiza clusters, remove acentos para deduplicação e preserva a grafia original.
              </p>
            )}
          </div>

          <div>
            <textarea
              required
              rows={isCompanies ? 6 : 8}
              placeholder={placeholder}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full p-3.5 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition resize-y"
            />
          </div>

          {/* Live Preview for GPT Terms */}
          {!isCompanies && parsedTerms && parsedTerms.terms.length > 0 && (
            <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-teal-900">
                  <CheckCircle2 size={16} className="text-teal-600" />
                  <span>{parsedTerms.terms.length} termos detectados e organizados</span>
                </div>
                {parsedTerms.duplicates > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    {parsedTerms.duplicates} duplicata(s) ignorada(s)
                  </span>
                )}
              </div>

              {clusterList.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-teal-800 flex items-center gap-1">
                    <Layers size={13} />
                    Clusters identificados ({clusterList.length}):
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {clusterList.map((cl) => {
                      const count = parsedTerms.terms.filter((t) => t.cluster === cl).length;
                      return (
                        <span
                          key={cl}
                          className="px-2 py-0.5 bg-white border border-teal-200 rounded-md text-[11px] text-teal-900 font-medium shadow-2xs"
                        >
                          {cl} <strong className="text-teal-700">({count})</strong>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="text-[11px] text-slate-500 italic">
                Amostra: &ldquo;{parsedTerms.terms[0]?.query}&rdquo;
                {parsedTerms.terms[1] ? `, &ldquo;${parsedTerms.terms[1]?.query}&rdquo;` : ''}...
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={importing || !content.trim()}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              <CheckCircle2 size={15} />
              {importing
                ? 'Importando...'
                : !isCompanies && parsedTerms
                  ? `Aprovar e Importar ${parsedTerms.terms.length} Termos`
                  : 'Importar Lote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
