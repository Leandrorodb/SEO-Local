import React from 'react';
import { ViewType } from '../types/nexus';
import {
  LayoutDashboard,
  Building2,
  KeyRound,
  Compass,
  CheckCheck,
  MessageSquare,
  UploadCloud,
  Terminal,
  Settings,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';

interface SidebarProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  companiesCount: number;
  reviewCount: number;
  isOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  companiesCount,
  reviewCount,
  isOpen,
  onCloseMobile,
}) => {
  const navItems = [
    { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
    { id: 'companies', label: 'Empresas', icon: Building2, count: companiesCount },
    { id: 'terms', label: 'Termos & Clusters', icon: KeyRound },
    { id: 'measurements', label: 'Medições', icon: Compass },
    { id: 'reviews', label: 'Fila de Revisão', icon: CheckCheck, badgeCount: reviewCount },
    { id: 'reports', label: 'Feedbacks WhatsApp', icon: MessageSquare },
    { id: 'import', label: 'Importar Resultados', icon: UploadCloud },
    { id: 'collector', label: 'Coletor Windows', icon: Terminal },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 z-40 lg:hidden backdrop-blur-xs"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#0f1e25] text-slate-300 flex flex-col p-5 transition-transform duration-200 lg:translate-x-0 lg:static lg:h-screen lg:shrink-0 ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-2 py-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#1b373b] border border-[#264b50] flex items-center justify-center text-[#4be0ae] shadow-sm">
            <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
              <path d="M5 29 18 5l13 24" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              <path d="m11 23 7-6 7 6" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="flex items-center font-bold text-white text-lg tracking-wider">
              NEXUS<span className="text-[#4be0ae]">.</span>
            </div>
            <div className="text-[9px] font-semibold tracking-widest text-[#7f9ca3] uppercase">
              LOCAL INTELLIGENCE
            </div>
          </div>
        </div>

        {/* Section title */}
        <div className="text-[10px] font-bold text-[#668189] tracking-wider px-3 mb-2 uppercase">
          Workspace
        </div>

        {/* Navigation list */}
        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id as ViewType);
                  onCloseMobile();
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 text-left ${
                  isActive
                    ? 'bg-[#1e3b39] text-[#e6fff7] shadow-xs border-l-4 border-[#42d9b5]'
                    : 'text-[#92abb0] hover:text-white hover:bg-[#162c34]'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-[#42d9b5]' : 'text-[#728f95]'} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.count !== undefined && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] bg-[#234147] text-[#a9c9ce] font-bold">
                    {item.count}
                  </span>
                )}
                {item.badgeCount ? (
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                    {item.badgeCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Environment Box */}
        <div className="mt-4 p-3 bg-[#162c34] border border-[#23434b] rounded-xl flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4be0ae] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#4be0ae]"></span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-white truncate">Operação Independente</div>
            <div className="text-[10px] text-[#87a3a9] truncate">Sem custos de API / Tokens</div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-[#234148] flex items-center justify-between text-[11px] text-[#718d94]">
          <div>
            <div className="text-white font-medium text-[10px]">Atlas / Operação Google</div>
            <div className="text-[9px] text-[#5e777d]">v1.2 · Auditoria Auditável</div>
          </div>
          <ShieldCheck size={16} className="text-[#4be0ae]" />
        </div>
      </aside>
    </>
  );
};
