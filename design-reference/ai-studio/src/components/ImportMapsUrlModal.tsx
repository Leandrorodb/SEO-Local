import React, { useState } from 'react';
import { Company } from '../types/nexus';
import {
  X,
  Link2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Building2,
  MapPin,
  Hash,
  ArrowRight,
} from 'lucide-react';

interface ImportMapsUrlModalProps {
  onClose: () => void;
  onSuccess: (company: Company) => void;
}

export const ImportMapsUrlModal: React.FC<ImportMapsUrlModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const [url, setUrl] = useState('');
  const [termsCount, setTermsCount] = useState(25);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setError('');
    setLoading(true);
    setLoadingStep('1/3: Resolvendo link do Google Maps e redirecionamentos...');

    try {
      setTimeout(() => {
        setLoadingStep('2/3: Extraindo CID, Coordenadas, Cidade e Nicho...');
      }, 2500);

      setTimeout(() => {
        setLoadingStep('3/3: Mapeando clusters e termos estratégicos com IA...');
      }, 5500);

      const res = await fetch('/api/companies/import-from-maps-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          termsCount,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao importar link');

      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Falha ao processar o link da ficha.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleFinish = () => {
    if (result?.company) {
      onSuccess(result.company);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <Link2 size={18} />
            </div>
            <div>
              <div className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">
                Automação Inteligente · 1 Clique
              </div>
              <h2 className="text-base font-bold text-slate-900">
                Importar Tudo Somente pelo Link da Ficha
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

        {/* Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!result ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3.5 bg-teal-50/80 border border-teal-200/80 rounded-xl text-xs text-teal-900 leading-relaxed space-y-1">
                <strong>Como funciona:</strong>
                <p>
                  Basta colar o link da empresa no Google Maps (incluindo links curtos do celular como <code className="font-mono text-teal-800">maps.app.goo.gl</code>). O sistema extrai automaticamente o <strong>Nome Oficial</strong>, <strong>Cidade</strong>, <strong>Coordenadas</strong>, <strong>CID da Ficha</strong> e cria a <strong>Matriz de Palavras-Chave</strong> com IA!
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Link da Ficha no Google Maps *
                </label>
                <div className="relative">
                  <Link2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    required
                    type="url"
                    placeholder="Ex.: https://maps.app.goo.gl/... ou https://www.google.com/maps/place/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={loading}
                    className="w-full pl-10 pr-4 py-2.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Quantidade de Palavras-Chave para Gerar
                </label>
                <select
                  value={termsCount}
                  onChange={(e) => setTermsCount(Number(e.target.value))}
                  disabled={loading}
                  className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20"
                >
                  <option value={20}>20 termos comerciais (Auditoria Ágil)</option>
                  <option value={30}>30 termos comerciais (Recomendado)</option>
                  <option value={45}>45 termos comerciais (Completo + Cauda Longa)</option>
                </select>
              </div>

              {loading && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-teal-800">
                    <Loader2 size={16} className="animate-spin text-teal-600" />
                    <span>Processando Ficha...</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono animate-pulse">
                    {loadingStep}
                  </p>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || !url.trim()}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-xl transition shadow-sm inline-flex items-center gap-1.5"
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      Importar Tudo da Ficha
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
                <CheckCircle2 size={22} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-950 space-y-1">
                  <strong className="text-sm block font-bold">Ficha e Termos Importados com Sucesso!</strong>
                  <p>
                    A empresa foi cadastrada no sistema com o CID comprovado e a matriz de {result.termsAdded} pesquisas comerciais já foi gerada para medição.
                  </p>
                </div>
              </div>

              {/* Company Details Card */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-teal-700" />
                  <strong className="text-slate-900 text-sm">{result.company.name}</strong>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 text-slate-600">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Localidade:</span>
                    <strong className="text-slate-800">{result.company.city}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">CID Oficial:</span>
                    <strong className="font-mono text-teal-800">{result.company.cid || 'Identificado'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Coordenadas:</span>
                    <strong className="font-mono text-slate-800">
                      {result.company.latitude.toFixed(4)}, {result.company.longitude.toFixed(4)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Termos Gerados:</span>
                    <strong className="text-teal-800 font-bold">{result.termsAdded} pesquisas prontas</strong>
                  </div>
                </div>
              </div>

              {/* Sample Terms */}
              {result.sampleTerms && result.sampleTerms.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-slate-700 block mb-1.5">
                    Exemplos de termos gerados para monitoramento:
                  </span>
                  <div className="space-y-1 text-xs">
                    {result.sampleTerms.map((t: any, idx: number) => (
                      <div
                        key={idx}
                        className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-800">{t.query}</span>
                        <span className="text-[10px] font-bold text-teal-700">{t.cluster} · {t.priority}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleFinish}
                  className="px-6 py-2.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-xl transition shadow-sm inline-flex items-center gap-1.5"
                >
                  Abrir Ficha e Ver Auditoria <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
