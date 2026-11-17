import React, { useState } from 'react';
import {
  Settings,
  Database,
  Cloud,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Server,
} from 'lucide-react';

interface SettingsViewProps {
  onRefreshAll: () => Promise<void>;
  showToast: (msg: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onRefreshAll,
  showToast,
}) => {
  const [reseeding, setReseeding] = useState(false);

  const handleReseed = async () => {
    if (!confirm('Deseja recarregar as 5 unidades padrão da matriz Jares (160 termos)? Registros existentes serão preservados.')) {
      return;
    }
    setReseeding(true);
    try {
      const res = await fetch('/api/system/reseed', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao recarregar seed');
      showToast('Matriz de 5 unidades e 160 termos recarregada com sucesso!');
      await onRefreshAll();
    } catch (err: any) {
      showToast(err.message || 'Erro ao recarregar');
    } finally {
      setReseeding(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <div className="text-[10px] font-extrabold text-teal-700 tracking-widest uppercase">
          Configurações do Sistema · Ambiente Cloud & Local
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
          Configurações e Persistência
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Visão técnica de armazenamento, conectores de nuvem e integridade dos dados.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Persistence Status */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <Database size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Banco de Dados Ativo</h2>
              <span className="text-xs text-slate-400">Node:SQLite Nativo (WAL Mode)</span>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl space-y-2 text-xs text-slate-600">
            <div className="flex justify-between">
              <span className="text-slate-400">Status:</span>
              <span className="font-bold text-emerald-700">Operacional (Local / AI Studio)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Diretório:</span>
              <span className="font-mono text-slate-800">local-data/nexus.sqlite</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Evidências:</span>
              <span className="font-mono text-slate-800">local-data/evidence/</span>
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            O banco SQLite gerencia empresas, termos, fila de execuções, hashes anti-duplicação de planilhas e histórico de decisões humanas.
          </p>

          <button
            onClick={handleReseed}
            disabled={reseeding}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
          >
            <RefreshCw size={14} className={reseeding ? 'animate-spin' : ''} />
            {reseeding ? 'Recarregando...' : 'Recarregar Matriz Padrão (5 Lojas Jares)'}
          </button>
        </div>

        {/* Cloud & Multi-Tenant State */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center">
              <Cloud size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Conexão Nuvem / Multi-Tenant</h2>
              <span className="text-xs text-slate-400">Firebase Firestore & Auth</span>
            </div>
          </div>

          <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1.5 text-xs text-amber-900">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertCircle size={15} className="text-amber-700" />
              Estado Atual: Modo Isolado Local
            </div>
            <p className="leading-relaxed">
              O Firebase Firestore e o Google Sign-In estão prontos para serem ativados quando você desejar comercializar o sistema como SaaS multi-organização.
            </p>
          </div>

          <div className="text-xs text-slate-600 space-y-2">
            <div className="font-bold text-slate-800">Coleções estruturadas para expansão SaaS:</div>
            <ul className="list-disc pl-5 space-y-1 font-mono text-[11px] text-slate-500">
              <li>/organizations/&#123;orgId&#125;/companies/</li>
              <li>/organizations/&#123;orgId&#125;/runs/</li>
              <li>/organizations/&#123;orgId&#125;/measurements/</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Security Architecture */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
          <ShieldCheck size={18} className="text-teal-700" />
          Segurança e LGPD
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Nenhuma credencial ou print de cliente é enviado para APIs de terceiros. As fórmulas de planilhas são sanitizadas contra ataques de injeção CSV (<code className="font-mono text-teal-800">=+@-</code>) antes do download em Excel ou Google Sheets.
        </p>
      </div>
    </div>
  );
};
