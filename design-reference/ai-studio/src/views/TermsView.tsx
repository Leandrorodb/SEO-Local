import React, { useState } from 'react';
import { Company, Term, Priority } from '../types/nexus';
import {
  KeyRound,
  Search,
  Plus,
  UploadCloud,
  Sparkles,
  Trash2,
  Filter,
  Tag,
} from 'lucide-react';

interface TermsViewProps {
  companies: Company[];
  selectedCompanyId: number | null;
  onSelectCompany: (id: number) => void;
  terms: Term[];
  onAddTerm: () => void;
  onBatchTerms: () => void;
  onSuggestKeywords: () => void;
  onDeleteTerm: (id: number) => Promise<void>;
}

export const TermsView: React.FC<TermsViewProps> = ({
  companies,
  selectedCompanyId,
  onSelectCompany,
  terms,
  onAddTerm,
  onBatchTerms,
  onSuggestKeywords,
  onDeleteTerm,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCluster, setSelectedCluster] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');

  const clusters = Array.from(new Set(terms.map((t) => t.cluster))).sort();

  const filtered = terms.filter((t) => {
    const matchesSearch = t.query.toLowerCase().includes(search.toLowerCase());
    const matchesCluster = selectedCluster === 'ALL' || t.cluster === selectedCluster;
    const matchesPriority = selectedPriority === 'ALL' || t.priority === selectedPriority;
    return matchesSearch && matchesCluster && matchesPriority;
  });

  const p1Count = terms.filter((t) => t.priority === 'P1').length;
  const p2Count = terms.filter((t) => t.priority === 'P2').length;
  const p3Count = terms.filter((t) => t.priority === 'P3').length;

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-extrabold text-teal-700 tracking-widest uppercase">
            Estratégia de Palavras-Chave · Clusters Comerciais
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Termos & Clusters
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Gerencie intenções de busca divididas por nicho e prioridades de medição (P1, P2 e P3).
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onSuggestKeywords}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition shadow-2xs flex items-center gap-1.5"
          >
            <Sparkles size={15} />
            Gerar Clusters sem IA
          </button>
          <button
            onClick={onBatchTerms}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition shadow-2xs flex items-center gap-1.5"
          >
            <UploadCloud size={15} />
            Importar em Lote
          </button>
          <button
            onClick={onAddTerm}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white transition shadow-sm flex items-center gap-1.5"
          >
            <Plus size={15} />
            Novo Termo
          </button>
        </div>
      </div>

      {/* Select Company Bar */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider shrink-0">
            Ficha Ativa:
          </div>
          <select
            value={selectedCompanyId || ''}
            onChange={(e) => onSelectCompany(Number(e.target.value))}
            className="text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 min-w-[260px]"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.city} ({c.term_count || 0} termos)
              </option>
            ))}
          </select>
        </div>

        {/* Stats Pill Counters */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">
            {terms.length} Total
          </span>
          <span className="px-3 py-1 rounded-full bg-teal-50 text-teal-800 font-bold border border-teal-200">
            {p1Count} P1 Principal
          </span>
          <span className="px-3 py-1 rounded-full bg-sky-50 text-sky-800 font-medium border border-sky-200">
            {p2Count} P2 Secundária
          </span>
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
            {p3Count} P3 Exploratória
          </span>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Buscar termo exato..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Cluster filter */}
          <select
            value={selectedCluster}
            onChange={(e) => setSelectedCluster(e.target.value)}
            className="text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20"
          >
            <option value="ALL">Todos os Clusters ({clusters.length})</option>
            {clusters.map((cl) => (
              <option key={cl} value={cl}>
                {cl}
              </option>
            ))}
          </select>

          {/* Priority filter */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20"
          >
            <option value="ALL">Todas Prioridades</option>
            <option value="P1">Apenas P1 (Alta)</option>
            <option value="P2">Apenas P2 (Média)</option>
            <option value="P3">Apenas P3 (Baixa)</option>
          </select>
        </div>
      </div>

      {/* Terms Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-6 py-4">Pesquisa Comercial</th>
                <th className="px-4 py-4">Cluster / Nicho</th>
                <th className="px-4 py-4">Prioridade</th>
                <th className="px-6 py-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60 transition">
                  <td className="px-6 py-3.5 font-bold text-slate-900 text-sm">
                    {t.query}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700">
                      <Tag size={12} className="text-slate-400" />
                      {t.cluster}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        t.priority === 'P1'
                          ? 'bg-teal-50 text-teal-800 border border-teal-200'
                          : t.priority === 'P2'
                          ? 'bg-sky-50 text-sky-800 border border-sky-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <button
                      onClick={() => onDeleteTerm(t.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Excluir pesquisa"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-xs">
            Nenhum termo encontrado com os filtros aplicados.
          </div>
        )}
      </div>
    </div>
  );
};
