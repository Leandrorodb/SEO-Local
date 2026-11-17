import React, { useState } from 'react';
import { Company } from '../types/nexus';
import {
  Terminal,
  Download,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Laptop,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface CollectorViewProps {
  companies: Company[];
  selectedCompanyId: number | null;
  onSelectCompany: (id: number) => void;
  onDownloadCollectorPayload: () => void;
}

export const CollectorView: React.FC<CollectorViewProps> = ({
  companies,
  selectedCompanyId,
  onSelectCompany,
  onDownloadCollectorPayload,
}) => {
  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-extrabold text-teal-700 tracking-widest uppercase">
            Arquitetura Híbrida · Coletor Local
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Coletor Playwright Windows
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Execute medições com o Google Chrome visível diretamente no seu computador para evitar bloqueios em nuvem.
          </p>
        </div>

        <button
          onClick={onDownloadCollectorPayload}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white transition shadow-sm inline-flex items-center gap-2 self-start sm:self-auto"
        >
          <Download size={15} />
          Baixar Payload de Termos ({selectedCompany?.name || 'Selecione a Loja'})
        </button>
      </div>

      {/* Why Hybrid Architecture Banner */}
      <div className="p-6 bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-lg space-y-3">
        <div className="flex items-center gap-2 text-teal-400 font-bold text-xs uppercase tracking-wider">
          <Laptop size={16} />
          Por que usar o Coletor no seu Computador?
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">
          Servidores em nuvem (como Cloud Run ou AWS) são frequentemente identificados e bloqueados pelo Google Maps com verificações de robô (CAPTCHA). Ao executar o medidor no seu Windows, a coleta ocorre com sua <strong>conexão residencial autêntica</strong>, navegador Chrome visível e <strong>custo zero de tokens ou APIs</strong>.
        </p>
      </div>

      {/* Steps Guide */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 font-extrabold text-sm flex items-center justify-center">
            1
          </div>
          <h3 className="text-sm font-bold text-slate-900">Baixar a Pasta do Coletor</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            A pasta <code className="font-mono text-teal-700 bg-teal-50 px-1 py-0.5 rounded">collector-local</code> já está preparada no repositório com o script <code className="font-mono">INICIAR_COLETOR.bat</code> e o código Playwright.
          </p>
        </div>

        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 font-extrabold text-sm flex items-center justify-center">
            2
          </div>
          <h3 className="text-sm font-bold text-slate-900">Exportar as Pesquisas</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Selecione a empresa desejada e clique em <strong>Baixar Payload de Termos</strong>. Salve o arquivo como <code className="font-mono text-teal-700 bg-teal-50 px-1 py-0.5 rounded">terms.json</code> na pasta do coletor.
          </p>
        </div>

        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 font-extrabold text-sm flex items-center justify-center">
            3
          </div>
          <h3 className="text-sm font-bold text-slate-900">Executar e Importar</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Dê duplo clique em <code className="font-mono text-slate-800">INICIAR_COLETOR.bat</code>. Ele medirá com Chrome visível, gerará o <code className="font-mono text-slate-800">MEDICOES_JARES.csv</code> e prints. Depois importe no painel web!
          </p>
        </div>
      </div>

      {/* Select Company Selector */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-slate-900">Configurar Coleta para Empresa</h2>
        <div className="max-w-md">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Selecione a Unidade para Gerar Payload
          </label>
          <select
            value={selectedCompanyId || ''}
            onChange={(e) => onSelectCompany(Number(e.target.value))}
            className="w-full text-xs font-bold px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.city} ({c.term_count || 0} termos)
              </option>
            ))}
          </select>
        </div>

        {selectedCompany && (
          <div className="p-4 bg-slate-50 rounded-xl text-xs space-y-1 text-slate-600">
            <div>
              <strong>Empresa:</strong> {selectedCompany.name} ({selectedCompany.city})
            </div>
            <div>
              <strong>Coordenadas de busca:</strong> {selectedCompany.latitude}, {selectedCompany.longitude}
            </div>
            <div>
              <strong>CID:</strong> <code className="font-mono text-teal-800">{selectedCompany.cid || 'Não configurado'}</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
