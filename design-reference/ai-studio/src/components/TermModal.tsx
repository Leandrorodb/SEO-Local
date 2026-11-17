import React, { useState } from 'react';
import { Priority } from '../types/nexus';
import { X, KeyRound } from 'lucide-react';

interface TermModalProps {
  companyName: string;
  onClose: () => void;
  onSave: (data: { query: string; cluster: string; priority: Priority }) => Promise<void>;
}

export const TermModal: React.FC<TermModalProps> = ({
  companyName,
  onClose,
  onSave,
}) => {
  const [query, setQuery] = useState('');
  const [cluster, setCluster] = useState('Loja de móveis');
  const [priority, setPriority] = useState<Priority>('P1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setError('');
    setSaving(true);
    try {
      await onSave({ query: query.trim(), cluster: cluster.trim(), priority });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar termo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <KeyRound size={18} />
            </div>
            <div>
              <div className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">
                Adicionar Pesquisa
              </div>
              <h2 className="text-base font-bold text-slate-900 truncate max-w-sm">
                {companyName}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Pesquisa Comercial Exata *
            </label>
            <input
              required
              type="text"
              placeholder="Ex.: loja de móveis em Lavras"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Cluster / Categoria *</label>
            <input
              required
              type="text"
              placeholder="Ex.: Loja de móveis, Sofás, Sala de jantar"
              value={cluster}
              onChange={(e) => setCluster(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Prioridade *</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="P1">P1 — Principal (Alta Relevância)</option>
              <option value="P2">P2 — Secundária (Média Relevância)</option>
              <option value="P3">P3 — Exploratória (Baixa Relevância)</option>
            </select>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-xl transition shadow-sm"
            >
              {saving ? 'Adicionando...' : 'Adicionar Pesquisa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
