import React, { useState, useEffect } from 'react';
import { Measurement } from '../types/nexus';
import { Badge } from '../components/Badge';
import {
  CheckCheck,
  AlertTriangle,
  ExternalLink,
  Check,
  Ban,
  Search,
  Building2,
  RefreshCw,
} from 'lucide-react';

interface ReviewViewProps {
  onOpenEvidence: (measurement: Measurement) => void;
  onRefreshAll: () => Promise<void>;
}

export const ReviewView: React.FC<ReviewViewProps> = ({
  onOpenEvidence,
  onRefreshAll,
}) => {
  const [reviews, setReviews] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const loadReviews = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/measurements/reviews');
      const data = await res.json();
      if (Array.isArray(data)) setReviews(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, []);

  const handleDecision = async (id: number, decision: 'confirm' | 'reject') => {
    setActingId(id);
    try {
      const res = await fetch(`/api/measurements/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          note:
            decision === 'confirm'
              ? 'Posição confirmada na fila de validação humana'
              : 'Rejeitado por divergência de identificação',
        }),
      });
      if (res.ok) {
        setReviews((prev) => prev.filter((r) => r.id !== id));
        await onRefreshAll();
      }
    } finally {
      setActingId(null);
    }
  };

  const filtered = reviews.filter((r) =>
    `${r.query} ${r.company_name} ${r.city}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-extrabold text-amber-700 tracking-widest uppercase">
            Auditoria Visual · Segurança de Entrega
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Fila de Revisão Humana
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Resultados com identificação parcial pelo nome que exigem validação de um analista antes de virar conquista no feedback.
          </p>
        </div>

        <button
          onClick={loadReviews}
          disabled={loading}
          className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition shadow-2xs flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Atualizar Fila
        </button>
      </div>

      {/* Rules Notice */}
      <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex items-start gap-3">
        <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 space-y-1">
          <strong>Regra Constitucional do Nexus:</strong> Uma correspondência encontrada apenas pelo nome ou endereço nunca é convertida automaticamente em 1º lugar ou Top 3. É indispensável conferir a imagem da busca e garantir que o resultado orgânico corresponde exatamente à unidade auditada.
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Filtrar por pesquisa ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          {reviews.length} Itens Aguardando Decisão
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs divide-y divide-slate-100">
        {filtered.map((item) => (
          <div key={item.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-5 hover:bg-slate-50/40 transition">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-md">
                  {item.company_name} ({item.city})
                </span>
                <span className="text-[11px] text-slate-400">
                  Cluster: <strong>{item.cluster}</strong>
                </span>
                <span className="text-[11px] text-slate-400">
                  Prioridade: <strong>{item.priority}</strong>
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900">{item.query}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Posição candidata observada: <strong className="text-amber-800 font-extrabold">{item.candidate_position}º lugar</strong>
                  {item.review_note ? ` · ${item.review_note}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                {item.search_url && (
                  <a
                    href={item.search_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-semibold text-teal-700 hover:underline inline-flex items-center gap-1"
                  >
                    <ExternalLink size={12} />
                    Ver pesquisa no Maps
                  </a>
                )}
                <button
                  onClick={() => onOpenEvidence(item)}
                  className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 ml-3"
                >
                  Inspecionar detalhes da captura ↗
                </button>
              </div>
            </div>

            {/* Decision Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={actingId === item.id}
                onClick={() => handleDecision(item.id, 'reject')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition inline-flex items-center gap-1.5"
              >
                <Ban size={14} />
                Rejeitar
              </button>
              <button
                type="button"
                disabled={actingId === item.id}
                onClick={() => handleDecision(item.id, 'confirm')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition inline-flex items-center gap-1.5 shadow-sm"
              >
                <Check size={14} />
                Confirmar {item.candidate_position}º Lugar
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-16 text-center text-slate-400 text-xs">
            <CheckCheck size={36} className="mx-auto text-emerald-500 mb-2" />
            <strong className="block text-slate-800 text-sm">Fila de Revisão Limpa!</strong>
            <p className="mt-1 text-slate-500">
              Não existem resultados ambíguos pendentes de decisão humana no momento.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
