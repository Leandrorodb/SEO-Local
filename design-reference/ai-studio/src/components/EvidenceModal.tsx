import React, { useState } from 'react';
import { Measurement } from '../types/nexus';
import { Badge } from './Badge';
import { X, ExternalLink, Check, Ban, Eye, MapPin, AlertTriangle, ShieldCheck } from 'lucide-react';

interface EvidenceModalProps {
  measurement: Measurement | null;
  onClose: () => void;
  onReviewDecision?: (id: number, decision: 'confirm' | 'reject', note?: string) => Promise<void>;
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({
  measurement,
  onClose,
  onReviewDecision,
}) => {
  const [reviewNote, setReviewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!measurement) return null;

  const results = measurement.results_json || [];
  const organicCards = results.filter((r) => !r.promoted);

  const handleDecision = async (decision: 'confirm' | 'reject') => {
    if (!onReviewDecision) return;
    setSubmitting(true);
    try {
      await onReviewDecision(measurement.id, decision, reviewNote);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between bg-slate-50/70">
          <div>
            <div className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">
              NEXUS WORKSPACE · TRILHA DE EVIDÊNCIAS
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1">
              {measurement.query || 'Pesquisa sem termo'}
            </h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge status={measurement.status} />
              <span className="text-xs text-slate-500 font-medium">
                Confiança: <strong className="text-slate-800">{measurement.confidence}</strong>
              </span>
              {measurement.measured_at && (
                <span className="text-xs text-slate-400">
                  · {new Date(measurement.measured_at).toLocaleString('pt-BR')}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Position Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[10px] uppercase font-bold text-slate-400">Posição Confirmada</span>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {measurement.position ? `${measurement.position}º` : '—'}
              </div>
            </div>
            <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80">
              <span className="text-[10px] uppercase font-bold text-amber-700">Posição Candidata</span>
              <div className="text-2xl font-black text-amber-900 mt-1">
                {measurement.candidate_position ? `${measurement.candidate_position}º ?` : '—'}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[10px] uppercase font-bold text-slate-400">Resultados Orgânicos</span>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {measurement.observed_count || organicCards.length}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[10px] uppercase font-bold text-slate-400">Cluster</span>
              <div className="text-sm font-bold text-slate-900 mt-2 truncate">
                {measurement.cluster || 'Geral'}
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="flex items-center gap-3">
            {measurement.search_url && (
              <a
                href={measurement.search_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition"
              >
                <ExternalLink size={14} />
                Abrir busca no Google Maps
              </a>
            )}
            {measurement.screenshot && (
              <a
                href={`/api/measurements/${measurement.id}/evidence`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition"
              >
                <Eye size={14} />
                Ver captura em tamanho real
              </a>
            )}
          </div>

          {/* Review Note or Notice */}
          {measurement.review_note && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 flex items-start gap-2.5">
              <ShieldCheck size={16} className="text-teal-600 shrink-0 mt-0.5" />
              <div>
                <strong>Nota do sistema / revisor:</strong> {measurement.review_note}
              </div>
            </div>
          )}

          {/* Results List on Google Maps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Cartões de Resultados Observados ({results.length})
              </h3>
              <span className="text-[11px] text-slate-400">
                {organicCards.length} orgânicos · {results.length - organicCards.length} anúncios
              </span>
            </div>

            {results.length > 0 ? (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-60 overflow-y-auto text-xs">
                {results.map((card, idx) => (
                  <div
                    key={idx}
                    className={`p-3 flex items-start justify-between gap-3 ${
                      card.promoted ? 'bg-amber-50/40 text-slate-500' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <strong className="text-slate-800">
                          {card.promoted ? '[ANÚNCIO]' : `${idx + 1}º`} — {card.name}
                        </strong>
                        {card.promoted && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                            Patrocinado (ignorado)
                          </span>
                        )}
                      </div>
                      {card.detail && (
                        <p className="text-slate-500 text-[11px] mt-1 line-clamp-2">
                          {card.detail}
                        </p>
                      )}
                    </div>
                    {card.url && (
                      <a
                        href={card.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-700 hover:text-teal-900 shrink-0 p-1"
                        title="Ver local no Maps"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                Nenhum cartão detalhado registrado nesta execução.
              </div>
            )}
          </div>

          {/* Review Decision Action if in REVIEW status */}
          {measurement.status === 'REVIEW' && (
            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <strong>Atenção para conferência humana:</strong> Esta posição candidata ({measurement.candidate_position}º lugar) foi localizada pelo nome da loja ou proximidade geográfica sem confirmação automática por CID. Confirme apenas se a unidade for idêntica e se a ordem no feed orgânico for autêntica.
                </div>
              </div>

              <input
                type="text"
                placeholder="Adicionar nota de validação (ex: Validado endereço Av. Major Venâncio)..."
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-amber-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-amber-500/30"
              />

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDecision('reject')}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition inline-flex items-center gap-1.5"
                >
                  <Ban size={14} />
                  Rejeitar Correspondência
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDecision('confirm')}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Check size={14} />
                  Confirmar como Posição Verificada
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div>Identificador da Medição: #{measurement.id}</div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-100 transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
