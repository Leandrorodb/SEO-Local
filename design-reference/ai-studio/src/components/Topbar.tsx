import React from 'react';
import { ViewType, Company } from '../types/nexus';
import { Menu, ShieldCheck, Calendar, ArrowRight } from 'lucide-react';

interface TopbarProps {
  currentView: ViewType;
  selectedCompany?: Company | null;
  onOpenMobileMenu: () => void;
  onNavigate: (view: ViewType) => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  currentView,
  selectedCompany,
  onOpenMobileMenu,
  onNavigate,
}) => {
  const titles: Record<ViewType, { breadcrumb: string; title: string }> = {
    overview: { breadcrumb: 'Operações', title: 'Visão geral' },
    companies: { breadcrumb: 'Carteira', title: 'Empresas e Fichas' },
    terms: { breadcrumb: 'Estratégia', title: 'Termos & Clusters' },
    measurements: { breadcrumb: 'Auditoria', title: 'Medições e Rankings' },
    reviews: { breadcrumb: 'Conferência', title: 'Fila de Revisão Humana' },
    reports: { breadcrumb: 'Comunicação', title: 'Feedbacks para WhatsApp' },
    import: { breadcrumb: 'Ingestão', title: 'Importar Resultados' },
    collector: { breadcrumb: 'Ferramenta', title: 'Coletor Windows' },
    settings: { breadcrumb: 'Sistema', title: 'Configurações e Nuvem' },
  };

  const current = titles[currentView] || { breadcrumb: 'Operações', title: 'Visão geral' };
  const todayStr = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date());

  return (
    <header className="h-16 lg:h-20 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between sticky top-0 z-30">
      {/* Left: Mobile trigger & breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium">{current.breadcrumb}</span>
          <span className="text-slate-300">/</span>
          <strong className="text-slate-800 font-semibold text-sm lg:text-base">
            {current.title}
          </strong>
          {selectedCompany && currentView !== 'companies' && (
            <span className="hidden sm:inline-flex items-center gap-1.5 ml-2 px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-600" />
              {selectedCompany.name} ({selectedCompany.city})
            </span>
          )}
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3 sm:gap-5">
        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <Calendar size={14} className="text-slate-400" />
          <span>{todayStr}</span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-bold shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="hidden sm:inline">Ambiente Ativo</span>
          <span className="sm:hidden">Online</span>
        </div>

        <div className="w-9 h-9 rounded-full bg-[#172b32] text-teal-300 flex items-center justify-center font-bold text-xs shadow-xs">
          LR
        </div>
      </div>
    </header>
  );
};
