import React, { useState } from 'react';
import { Company } from '../types/nexus';
import { X, Building2, MapPin, Hash, Link2 } from 'lucide-react';

interface CompanyModalProps {
  company?: Company | null;
  onClose: () => void;
  onSave: (data: Partial<Company>) => Promise<void>;
}

export const CompanyModal: React.FC<CompanyModalProps> = ({
  company,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(company?.name || '');
  const [city, setCity] = useState(company?.city || '');
  const [latitude, setLatitude] = useState(company ? String(company.latitude) : '');
  const [longitude, setLongitude] = useState(company ? String(company.longitude) : '');
  const [cid, setCid] = useState(company?.cid || '');
  const [mapsUrl, setMapsUrl] = useState(company?.maps_url || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90) {
      setError('Latitude inválida (deve estar entre -90 e 90)');
      return;
    }
    if (!Number.isFinite(lon) || Math.abs(lon) > 180) {
      setError('Longitude inválida (deve estar entre -180 e 180)');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name,
        city,
        latitude: lat,
        longitude: lon,
        cid: cid.replace(/^0x/i, '').trim().toLowerCase(),
        maps_url: mapsUrl.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar empresa');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <Building2 size={18} />
            </div>
            <div>
              <div className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">
                {company ? 'Editar Ficha' : 'Cadastrar Empresa'}
              </div>
              <h2 className="text-base font-bold text-slate-900">
                {company ? company.name : 'Nova Unidade no Sistema'}
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
              Nome da Empresa / Unidade *
            </label>
            <input
              required
              type="text"
              placeholder="Ex.: Jares Móveis — Lavras"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Cidade / Região *</label>
            <input
              required
              type="text"
              placeholder="Ex.: Lavras, MG"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Latitude *</label>
              <input
                required
                type="number"
                step="any"
                placeholder="-21.2438"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Longitude *</label>
              <input
                required
                type="number"
                step="any"
                placeholder="-44.9883"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              CID da Ficha (Hexadecimal)
            </label>
            <input
              type="text"
              placeholder="Ex.: 494c784ebd090660"
              value={cid}
              onChange={(e) => setCid(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              O CID é o identificador único da ficha no Google Maps. Ele permite validar colocações com 100% de precisão auditável.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              URL da Ficha no Google Maps (Opcional)
            </label>
            <input
              type="url"
              placeholder="https://www.google.com/maps/place/..."
              value={mapsUrl}
              onChange={(e) => setMapsUrl(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
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
              {saving ? 'Salvando...' : 'Salvar Empresa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
