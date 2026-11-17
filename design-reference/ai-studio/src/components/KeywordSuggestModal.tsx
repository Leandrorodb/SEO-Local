import React, { useState, useEffect } from 'react';
import { Company, Priority } from '../types/nexus';
import { X, Sparkles, Bot, Check, CheckSquare, Square, Layers, Wand2 } from 'lucide-react';

interface KeywordSuggestModalProps {
  company: Company;
  onClose: () => void;
  onImportTerms: (terms: Array<{ query: string; cluster: string; priority: Priority }>) => Promise<void>;
}

export const KeywordSuggestModal: React.FC<KeywordSuggestModalProps> = ({
  company,
  onClose,
  onImportTerms,
}) => {
  const [tab, setTab] = useState<'ai' | 'deterministic'>('ai');

  // AI Tab state
  const [aiNiche, setAiNiche] = useState('');
  const [aiCount, setAiCount] = useState(35);

  // Deterministic Tab state
  const [niches, setNiches] = useState<Array<{ value: string; title: string }>>([]);
  const [selectedNiche, setSelectedNiche] = useState('moveis');
  const [products, setProducts] = useState('');

  // Results state
  const [generated, setGenerated] = useState<
    Array<{ query: string; cluster: string; priority: Priority; selected: boolean }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/niches')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setNiches(data);
      })
      .catch(console.error);
  }, []);

  const handleGenerateAI = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/keywords/ai-discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: company.id,
          niche: aiNiche.trim() || company.name,
          count: aiCount,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar termos com IA');
      if (!Array.isArray(data) || !data.length) {
        throw new Error('Nenhum termo retornado para esta combinação.');
      }
      setGenerated(data.map((t: any) => ({ ...t, selected: true })));
    } catch (err: any) {
      setError(err.message || 'Erro ao sugerir termos com IA');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDeterministic = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const productList = products
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

      const res = await fetch('/api/keywords/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: company.id,
          niche: selectedNiche,
          products: productList,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar termos');
      setGenerated(data.map((t: any) => ({ ...t, selected: true })));
    } catch (err: any) {
      setError(err.message || 'Erro ao sugerir termos');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelectAll = () => {
    const allSelected = generated.every((t) => t.selected);
    setGenerated(generated.map((t) => ({ ...t, selected: !allSelected })));
  };

  const handleToggleIndex = (idx: number) => {
    setGenerated(
      generated.map((t, i) => (i === idx ? { ...t, selected: !t.selected } : t))
    );
  };

  const handleImport = async () => {
    const selectedTerms = generated
      .filter((t) => t.selected)
      .map(({ query, cluster, priority }) => ({ query, cluster, priority }));

    if (!selectedTerms.length) {
      setError('Selecione pelo menos um termo para importar');
      return;
    }

    setSaving(true);
    try {
      await onImportTerms(selectedTerms);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao importar termos sugeridos');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <Wand2 size={18} />
            </div>
            <div>
              <div className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">
                Descoberta de Termos & Clusters
              </div>
              <h2 className="text-base font-bold text-slate-900 truncate max-w-md">
                Gerar Palavras-Chave para {company.name} ({company.city})
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

        {/* Tab Selectors */}
        <div className="px-6 pt-3 flex border-b border-slate-200 gap-4 text-xs font-bold">
          <button
            type="button"
            onClick={() => setTab('ai')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition ${
              tab === 'ai'
                ? 'border-teal-700 text-teal-800'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <Bot size={15} />
            Auto-Descoberta por IA (Recomendado)
          </button>
          <button
            type="button"
            onClick={() => setTab('deterministic')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition ${
              tab === 'deterministic'
                ? 'border-teal-700 text-teal-800'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <Layers size={15} />
            Matriz Tradicional Determinística
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          )}

          {tab === 'ai' ? (
            <form onSubmit={handleGenerateAI} className="space-y-4">
              <div className="p-3.5 bg-teal-50/80 border border-teal-200/80 rounded-xl text-xs text-teal-900 leading-relaxed">
                A inteligência artificial analisa a cidade de <strong>{company.city}</strong> e o segmento do cliente para mapear todas as pesquisas comerciais que clientes reais digitam no Google Maps, já agrupadas em clusters temáticos com prioridades P1, P2 e P3.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  O que a empresa vende / Serviços oferecidos
                </label>
                <input
                  type="text"
                  placeholder="Ex.: Loja de móveis, sofás retráteis, colchões, mesa de jantar, decoração"
                  value={aiNiche}
                  onChange={(e) => setAiNiche(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Você pode digitar livremente qualquer nicho: odontologia, advocacia, pizzaria, oficina mecânica, etc.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Quantidade aproximada de termos
                </label>
                <select
                  value={aiCount}
                  onChange={(e) => setAiCount(Number(e.target.value))}
                  className="w-full text-xs px-3.5 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20"
                >
                  <option value={20}>20 termos (Auditoria Rápida)</option>
                  <option value={35}>35 termos (Matriz Padrão Recomendada)</option>
                  <option value={50}>50 termos (Auditoria Completa & Cauda Longa)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm"
              >
                <Sparkles size={15} />
                {loading ? 'IA descobrindo termos locais...' : 'Descobrir Termos e Clusters com IA'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleGenerateDeterministic} className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed">
                Geração determinística por matriz pré-definida sem chamadas de IA.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Segmento / Nicho</label>
                <select
                  value={selectedNiche}
                  onChange={(e) => setSelectedNiche(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                >
                  {niches.map((n) => (
                    <option key={n.value} value={n.value}>
                      {n.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Produtos ou Serviços Reais da Loja (Separados por vírgula)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex.: sofás retráteis, colchões ortopédicos, mesas de jantar"
                  value={products}
                  onChange={(e) => setProducts(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
              >
                <Layers size={14} className="text-teal-400" />
                {loading ? 'Calculando combinações...' : 'Gerar Sugestões Tradicionais'}
              </button>
            </form>
          )}

          {/* Generated Terms Preview */}
          {generated.length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  {generated.filter((t) => t.selected).length} de {generated.length} termos selecionados
                </span>
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="text-xs font-semibold text-teal-700 hover:underline"
                >
                  {generated.every((t) => t.selected) ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
                {generated.map((term, i) => (
                  <div
                    key={i}
                    onClick={() => handleToggleIndex(i)}
                    className="p-2.5 flex items-center gap-3 hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={term.selected}
                      onChange={() => {}}
                      className="rounded text-teal-600 focus:ring-teal-500 h-4 w-4 pointer-events-none"
                    />
                    <div className="flex-1 min-w-0">
                      <strong className="text-slate-800 block truncate">{term.query}</strong>
                      <span className="text-[10px] text-slate-400">
                        {term.cluster} · <span className="font-bold text-teal-700">{term.priority}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {generated.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Pronto para monitorar na ficha de {company.city}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving || !generated.some((t) => t.selected)}
                onClick={handleImport}
                className="px-5 py-2.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-xl transition shadow-sm inline-flex items-center gap-1.5"
              >
                <Check size={14} />
                {saving ? 'Importando...' : `Adicionar ${generated.filter((t) => t.selected).length} Termos`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
