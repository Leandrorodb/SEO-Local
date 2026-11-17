import React, { useState } from 'react';
import { Company, Run, Measurement, Priority } from '../types/nexus';
import { Badge } from '../components/Badge';
import {
  Compass,
  Play,
  Download,
  Terminal,
  Trophy,
  ArrowUp,
  ArrowDown,
  Minus,
  Eye,
  AlertTriangle,
  Clock,
  Sparkles,
} from 'lucide-react';

interface MeasurementsViewProps {
  companies: Company[];
  selectedCompanyId: number | null;
  onSelectCompany: (id: number) => void;
  run: Run | null;
  previousRun: Run | null;
  runs: Run[];
  selectedRunId: number | null;
  onSelectRun: (id: number) => void;
  onStartRun: (mode: 'priority' | 'all') => Promise<void>;
  onExportCsv: () => void;
  onDownloadCollectorPayload: () => void;
  onOpenEvidence: (measurement: Measurement) => void;
}

export const MeasurementsView: React.FC<MeasurementsViewProps> = ({
  companies,
  selectedCompanyId,
  onSelectCompany,
  run,
  previousRun,
  runs,
  selectedRunId,
  onSelectRun,
  onStartRun,
  onExportCsv,
  onDownloadCollectorPayload,
  onOpenEvidence,
}) => {
  const [startModal, setStartModal] = useState(false);
  const [startMode, setStartMode] = useState<'priority' | 'all'>('priority');
  const [starting, setStarting] = useState(false);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);
  const rows = run?.measurements || [];

  // Previous run map for position variation
  const prevMap = new Map((previousRun?.measurements || []).map((m) => [m.term_id, m]));

  const renderVariation = (m: Measurement) => {
    const prev = prevMap.get(m.term_id);
    if (!prev || m.status !== 'VERIFIED' || prev.status !== 'VERIFIED' || !m.position || !prev.position) {
      return <span className="text-slate-300 font-semibold">—</span>;
    }
    const diff = prev.position - m.position;
    if (diff > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-emerald-700 font-bold text-xs">
          <ArrowUp size={13} /> {diff}
        </span>
      );
    }
    if (diff < 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-rose-600 font-bold text-xs">
          <ArrowDown size={13} /> {Math.abs(diff)}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 text-slate-400 font-semibold text-xs">
        <Minus size={13} /> =
      </span>
    );
  };

  const verified = rows.filter((x) => x.status === 'VERIFIED');
  const review = rows.filter((x) => x.status === 'REVIEW');
  const first = verified.filter((x) => x.position === 1).length;
  const top3 = verified.filter((x) => x.position && x.position <= 3).length;
  const top5 = verified.filter((x) => x.position && x.position <= 5).length;

  const handleStartSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStarting(true);
    try {
      await onStartRun(startMode);
      setStartModal(false);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-extrabold text-teal-700 tracking-widest uppercase">
            Auditoria em Campo · Google Maps Local
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Medições & Rankings
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Auditoria de posicionamento a partir de coordenadas geográficas reais e identificador CID.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onDownloadCollectorPayload}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition shadow-2xs flex items-center gap-1.5"
            title="Baixar JSON de termos para executar no coletor Windows local"
          >
            <Terminal size={15} />
            Payload Coletor Windows
          </button>
          {run && (
            <button
              onClick={onExportCsv}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition shadow-2xs flex items-center gap-1.5"
            >
              <Download size={15} />
              Exportar CSV
            </button>
          )}
          <button
            onClick={() => setStartModal(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white transition shadow-sm flex items-center gap-1.5"
          >
            <Play size={15} />
            Medir Pesquisas
          </button>
        </div>
      </div>

      {/* Select Company and Info Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Ficha Selecionada</h2>
            {selectedCompany?.cid && (
              <span className="px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-mono font-bold">
                CID: {selectedCompany.cid}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              Empresa / Unidade
            </label>
            <select
              value={selectedCompanyId || ''}
              onChange={(e) => onSelectCompany(Number(e.target.value))}
              className="w-full text-xs font-bold px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.city}
                </option>
              ))}
            </select>
          </div>

          {selectedCompany && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Localidade</span>
                <strong className="block text-xs text-slate-800 mt-1">{selectedCompany.city}</strong>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Coordenadas</span>
                <strong className="block text-[11px] font-mono text-slate-800 mt-1">
                  {selectedCompany.latitude.toFixed(4)}, {selectedCompany.longitude.toFixed(4)}
                </strong>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Total de Termos</span>
                <strong className="block text-xs text-slate-800 mt-1">
                  {selectedCompany.term_count || 0}
                </strong>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Prioridade P1</span>
                <strong className="block text-xs text-teal-800 font-bold mt-1">
                  {selectedCompany.p1_count || 0} termos
                </strong>
              </div>
            </div>
          )}
        </div>

        {/* Audit Metric Highlights */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900">Resultado da Coleta</h2>
              {run && <Badge status={run.status} />}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 rounded-xl bg-teal-50 border border-teal-200/80">
                <div className="text-2xl font-black text-teal-800">{first}</div>
                <div className="text-[10px] font-bold text-teal-600 mt-0.5">🥇 1º Lugares</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="text-2xl font-black text-slate-800">{top3}</div>
                <div className="text-[10px] font-bold text-slate-500 mt-0.5">Top 3</div>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/80">
                <div className="text-2xl font-black text-amber-800">{review.length}</div>
                <div className="text-[10px] font-bold text-amber-700 mt-0.5">Para Revisar</div>
              </div>
            </div>

            {run && (
              <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-slate-700">Execução #{run.id}</span>
                  <span className="text-[11px] text-slate-400">
                    {run.completed}/{run.total} pesquisas
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mb-2">
                  <div
                    className="bg-teal-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((run.completed / Math.max(1, run.total)) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  {run.message || 'Auditoria pronta'} {run.source === 'IMPORT' ? '· Importado' : ''}
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500">
            Apenas posições comprovadas por CID figuram nos feedbacks.
          </div>
        </div>
      </div>

      {/* Golden Opportunities: Terms in 2nd or 3rd place close to #1 */}
      {verified.filter((x) => x.position === 2 || x.position === 3).length > 0 && (
        <div className="p-5 bg-gradient-to-r from-amber-500/10 via-teal-500/10 to-transparent border border-amber-300/60 rounded-2xl shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-amber-700" />
            <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
              Oportunidades de Ouro (Quase 1º Lugar · Posições 2º e 3º)
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200/60 text-amber-900 ml-auto">
              {verified.filter((x) => x.position === 2 || x.position === 3).length} termos a 1 passo do topo
            </span>
          </div>
          <p className="text-xs text-amber-900/80 mb-3">
            Estes termos já têm relevância excelente. Otimizar atributos da ficha (avaliações recentes, fotos e postagens) pode empurrá-los diretamente para a 1ª colocação no Maps:
          </p>
          <div className="flex flex-wrap gap-2">
            {verified
              .filter((x) => x.position === 2 || x.position === 3)
              .slice(0, 8)
              .map((item) => (
                <div
                  key={item.id}
                  onClick={() => onOpenEvidence(item)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-amber-300/80 text-xs text-slate-800 shadow-2xs hover:border-amber-500 transition cursor-pointer flex items-center gap-2"
                >
                  <span className="font-extrabold text-amber-800">{item.position}º</span>
                  <span className="font-semibold truncate max-w-[220px]">{item.query}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Historical Runs Chips */}
      {runs.length > 0 && (
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Histórico de Auditorias ({runs.length})
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {runs.map((r) => {
              const isSelected = r.id === selectedRunId;
              return (
                <button
                  key={r.id}
                  onClick={() => onSelectRun(r.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition border ${
                    isSelected
                      ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  #{r.id} · {new Date(r.created_at).toLocaleDateString('pt-BR')} · {r.completed}/{r.total}
                  {r.source === 'IMPORT' ? ' (Importado)' : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Measurements Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {run ? `Resultados da Execução #${run.id}` : 'Pesquisas Cadastradas'}
            </h2>
            <p className="text-xs text-slate-400">
              {run
                ? `${rows.length} termos auditados nesta coleta`
                : 'Aguardando execução ou importação de medição'}
            </p>
          </div>
          {run && (
            <span className="text-xs font-bold text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
              {verified.length} Posições Auditadas
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-6 py-4">Pesquisa</th>
                <th className="px-4 py-4">Cluster</th>
                <th className="px-4 py-4">Prioridade</th>
                <th className="px-4 py-4">Posição</th>
                <th className="px-4 py-4">Variação</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-6 py-4 text-right">Evidência</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/60 transition">
                  <td className="px-6 py-3.5">
                    <strong className="text-slate-900 block text-sm font-bold">{m.query}</strong>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600 font-medium">{m.cluster}</td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        m.priority === 'P1'
                          ? 'bg-teal-50 text-teal-800 border border-teal-200'
                          : m.priority === 'P2'
                          ? 'bg-sky-50 text-sky-800 border border-sky-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {m.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    {m.position ? (
                      <span className="text-sm font-black text-slate-900">{m.position}º</span>
                    ) : m.candidate_position ? (
                      <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                        {m.candidate_position}º ?
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">{renderVariation(m)}</td>
                  <td className="px-4 py-3.5">
                    <Badge status={m.status} />
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <button
                      onClick={() => onOpenEvidence(m)}
                      className="px-3 py-1.5 rounded-xl font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 transition inline-flex items-center gap-1.5 text-xs"
                    >
                      <Eye size={13} />
                      Inspecionar ↗
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-xs">
            Nenhuma medição encontrada para a ficha selecionada.
            <div className="mt-3">
              <button
                onClick={() => setStartModal(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white transition shadow-sm inline-flex items-center gap-1.5"
              >
                <Play size={14} />
                Iniciar Primeira Medição
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Start Measurement Modal */}
      {startModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                <Compass size={18} />
              </div>
              <h2 className="text-base font-bold text-slate-900">Iniciar Auditoria de Medição</h2>
            </div>

            <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-900 leading-relaxed">
              <strong>Atenção de integridade:</strong> As buscas ocorrem a partir da localização de referência de <strong>{selectedCompany?.city}</strong>. No container em nuvem, se o Chrome visível não estiver disponível, você pode baixar o payload e rodar no seu Windows com o Coletor Local.
            </div>

            <form onSubmit={handleStartSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Escopo da Coleta</label>
                <select
                  value={startMode}
                  onChange={(e) => setStartMode(e.target.value as 'priority' | 'all')}
                  className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20"
                >
                  <option value="priority">Prioridade P1 (Termos Principais)</option>
                  <option value="all">Todos os Termos Cadastrados (P1, P2 e P3)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStartModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={starting}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-xl transition shadow-sm"
                >
                  {starting ? 'Iniciando...' : 'Iniciar Coleta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
