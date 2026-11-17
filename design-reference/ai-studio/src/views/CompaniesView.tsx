import React, { useState } from 'react';
import { Company, ViewType } from '../types/nexus';
import { Badge } from '../components/Badge';
import {
  Building2,
  Search,
  Plus,
  UploadCloud,
  Edit2,
  Trash2,
  ArrowRight,
  MapPin,
  ExternalLink,
} from 'lucide-react';

interface CompaniesViewProps {
  companies: Company[];
  onSelectCompany: (id: number) => void;
  onNewCompany: () => void;
  onImportFromMapsUrl: () => void;
  onBatchCompanies: () => void;
  onEditCompany: (company: Company) => void;
  onDeleteCompany: (id: number) => void;
  onNavigate: (view: ViewType) => void;
}

export const CompaniesView: React.FC<CompaniesViewProps> = ({
  companies,
  onSelectCompany,
  onNewCompany,
  onImportFromMapsUrl,
  onBatchCompanies,
  onEditCompany,
  onDeleteCompany,
  onNavigate,
}) => {
  const [search, setSearch] = useState('');

  const filtered = companies.filter((c) =>
    `${c.name} ${c.city} ${c.cid}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-extrabold text-teal-700 tracking-widest uppercase">
            Gestão de Carteira · Perfis e Fichas
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Empresas e Unidades
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Cadastre perfis, organize as coordenadas de referência e gerencie seus termos.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onImportFromMapsUrl}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 transition shadow-2xs flex items-center gap-1.5"
          >
            <ExternalLink size={14} className="text-teal-700" />
            ✦ Importar por Link do Maps
          </button>
          <button
            onClick={onBatchCompanies}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition shadow-2xs flex items-center gap-1.5"
          >
            <UploadCloud size={15} />
            Importar em Lote
          </button>
          <button
            onClick={onNewCompany}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white transition shadow-sm flex items-center gap-1.5"
          >
            <Plus size={15} />
            Nova Empresa
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Buscar por nome, cidade ou CID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          {companies.length} Unidades no Sistema
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-6 py-4">Empresa / Unidade</th>
                <th className="px-4 py-4">Localidade</th>
                <th className="px-4 py-4">Coordenadas</th>
                <th className="px-4 py-4">Termos</th>
                <th className="px-4 py-4">Prioridade P1</th>
                <th className="px-4 py-4">Última Coleta</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/60 transition">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900 text-sm">{c.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>CID: {c.cid ? <code className="font-mono text-teal-800">{c.cid}</code> : 'Não informado'}</span>
                      {c.maps_url && (
                        <a
                          href={c.maps_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-teal-600 hover:text-teal-800 inline-flex items-center gap-0.5"
                        >
                          <ExternalLink size={11} />
                          Ficha
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-700 font-medium">{c.city}</td>
                  <td className="px-4 py-4 font-mono text-[11px] text-slate-500">
                    {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-bold text-slate-900">{c.term_count || 0}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 font-bold text-[11px]">
                      {c.p1_count || 0} P1
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <Badge status={c.last_status} />
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => onEditCompany(c)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                      title="Editar ficha"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => onDeleteCompany(c.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Excluir empresa"
                    >
                      <Trash2 size={15} />
                    </button>
                    <button
                      onClick={() => onSelectCompany(c.id)}
                      className="px-3 py-1.5 rounded-xl font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 transition inline-flex items-center gap-1"
                    >
                      Auditoria <ArrowRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-xs">
            Nenhuma empresa encontrada para o filtro informado.
          </div>
        )}
      </div>
    </div>
  );
};
