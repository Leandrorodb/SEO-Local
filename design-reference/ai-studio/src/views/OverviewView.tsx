import React from 'react';
import { Summary, Company, ViewType } from '../types/nexus';
import { StatCard } from '../components/StatCard';
import { Badge } from '../components/Badge';
import {
  Building2,
  KeyRound,
  Trophy,
  Clock,
  ArrowRight,
  Plus,
  Compass,
  UploadCloud,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface OverviewViewProps {
  summary: Summary | null;
  companies: Company[];
  onNavigate: (view: ViewType) => void;
  onSelectCompany: (id: number) => void;
  onNewCompany: () => void;
  onImportFromMapsUrl: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  summary,
  companies,
  onNavigate,
  onSelectCompany,
  onNewCompany,
  onImportFromMapsUrl,
}) => {
  const s = summary || {
    companies: companies.length,
    terms: 0,
    completed: 0,
    measured: 0,
    reviews: 0,
    top1: 0,
    top3: 0,
    recent: [],
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-extrabold text-teal-700 tracking-widest uppercase">
            Inteligência Local · Auditoria Maps
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Visão Geral da Operação
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Medições, oportunidades e relatórios da carteira em um único painel auditável.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onImportFromMapsUrl}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 transition shadow-2xs flex items-center gap-1.5"
          >
            <Sparkles size={14} className="text-teal-700" />
            ✦ Importar por Link do Maps
          </button>
          <button
            onClick={onNewCompany}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition shadow-2xs flex items-center gap-1.5"
          >
            <Plus size={15} />
            Cadastrar Manual
          </button>
          <button
            onClick={() => onNavigate('import')}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition shadow-2xs flex items-center gap-1.5"
          >
            <UploadCloud size={15} />
            Importar Resultados
          </button>
          <button
            onClick={() => onNavigate('measurements')}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white transition shadow-sm flex items-center gap-1.5"
          >
            <Compass size={15} />
            Iniciar Medição
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Building2 size={20} />}
          label="Empresas Cadastradas"
          value={s.companies}
          note="Fichas monitoradas com CID"
          accent="teal"
        />
        <StatCard
          icon={<KeyRound size={20} />}
          label="Palavras-Chave"
          value={s.terms}
          note="Termos por cidade e cluster"
          accent="default"
        />
        <StatCard
          icon={<Trophy size={20} />}
          label="Posições Confirmadas"
          value={s.measured}
          note="Com ID da ficha ou revisão humana"
          accent="emerald"
        />
        <StatCard
          icon={<Clock size={20} />}
          label="Aguardando Revisão"
          value={s.reviews}
          note="Não anunciadas nos feedbacks"
          accent="amber"
        />
      </div>

      {/* Grid: Companies + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Companies list */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Carteira Monitorada</h2>
              <p className="text-xs text-slate-400">Suas fichas e unidades ativas</p>
            </div>
            <button
              onClick={() => onNavigate('companies')}
              className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1"
            >
              Ver todas <ArrowRight size={14} />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {companies.slice(0, 6).map((c) => (
              <div
                key={c.id}
                className="py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 px-2 rounded-xl transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center font-extrabold text-teal-800 text-xs shrink-0">
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <strong className="text-xs sm:text-sm text-slate-900 block truncate">
                      {c.name}
                    </strong>
                    <span className="text-[11px] text-slate-400 block truncate">
                      {c.city} · {c.term_count || 0} pesquisas cadastradas
                      {c.cid ? ` · CID: ${c.cid}` : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Badge status={c.last_status} />
                  <button
                    onClick={() => onSelectCompany(c.id)}
                    className="text-xs font-bold text-teal-700 hover:text-teal-900 px-2.5 py-1 rounded-lg hover:bg-teal-50 transition"
                  >
                    Abrir ↗
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Recent activity */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Atividade Recente</h2>
                <p className="text-xs text-slate-400">Histórico de coletas e importações</p>
              </div>
            </div>

            {s.recent && s.recent.length > 0 ? (
              <div className="space-y-3">
                {s.recent.slice(0, 5).map((r) => (
                  <div key={r.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span className="truncate">{r.company_name}</span>
                      <Badge status={r.status} />
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                      <span>
                        {r.completed}/{r.total} pesquisas {r.source === 'IMPORT' ? '(Importado)' : ''}
                      </span>
                      <span>{new Date(r.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <Clock size={28} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-bold text-slate-700">Sem medições ainda</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Os registros aparecerão conforme você importar um CSV ou executar auditorias.
                </p>
              </div>
            )}
          </div>

          {/* Local / Audit Guarantee Box */}
          <div className="mt-6 p-4 rounded-xl bg-teal-50/80 border border-teal-200/80 text-xs text-teal-900 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-teal-950">
              <CheckCircle2 size={16} className="text-teal-700" />
              Auditoria de Verdade, Sem Números Falsos
            </div>
            <p className="text-[11px] text-teal-800 leading-relaxed">
              O sistema não simula posições e não inventa rankings. Todo 1º lugar no relatório vem de CID comprovado ou validação visual humana com print arquivado.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
