import React, { useState } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface ImportViewProps {
  onRefreshAll: () => Promise<void>;
  showToast: (msg: string) => void;
}

export const ImportView: React.FC<ImportViewProps> = ({
  onRefreshAll,
  showToast,
}) => {
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvText(content);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvText.trim()) {
      setError('Por favor, selecione um arquivo CSV ou cole seu conteúdo.');
      return;
    }
    setError('');
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/import/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao processar importação');

      setResult(data);
      if (data.duplicate) {
        showToast('Aviso: Esta planilha já foi importada anteriormente.');
      } else {
        showToast(`${data.imported} medições importadas com sucesso!`);
        await onRefreshAll();
      }
    } catch (err: any) {
      setError(err.message || 'Erro durante a importação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-extrabold text-teal-700 tracking-widest uppercase">
            Ingestão Auditável · Compatível com v1.1 e v1.2
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Importar Resultados de Auditoria
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Importe o arquivo <code className="font-mono text-teal-700">MEDICOES_JARES.csv</code> gerado pelo coletor Windows para auditar rankings na nuvem.
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Uploader */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Arquivo de Medições</h2>
            <span className="text-xs text-slate-400">Padrão delimitado por ponto e vírgula (;)</span>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Drag & Drop Area */}
          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:bg-slate-50 transition cursor-pointer relative">
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <UploadCloud size={36} className="mx-auto text-teal-600 mb-2" />
            <strong className="text-sm text-slate-800 block">
              {fileName ? fileName : 'Arraste o arquivo CSV ou clique para selecionar'}
            </strong>
            <p className="text-xs text-slate-400 mt-1">
              Suporta formato oficial <code className="font-mono text-teal-700">MEDICOES_JARES.csv</code>
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">Ou cole o conteúdo CSV aqui:</label>
              {csvText && (
                <button
                  type="button"
                  onClick={() => {
                    setCsvText('');
                    setFileName('');
                  }}
                  className="text-xs text-rose-600 hover:underline"
                >
                  Limpar
                </button>
              )}
            </div>
            <textarea
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`"Unidade";"Cluster";"Prioridade";"Termo";"Posição observada";"Status";"Data/hora";"Busca Maps";"Print"`}
              className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div className="pt-2 flex items-center justify-end">
            <button
              onClick={handleImport}
              disabled={loading || !csvText.trim()}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white transition shadow-sm inline-flex items-center gap-2"
            >
              <UploadCloud size={16} />
              {loading ? 'Processando e Validando CIDs...' : 'Processar Importação'}
            </button>
          </div>

          {/* Outcome Summary */}
          {result && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mt-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-teal-600" />
                <strong className="text-xs text-slate-900">Resultado do Processamento:</strong>
              </div>

              {result.duplicate ? (
                <p className="text-xs text-amber-800">
                  {result.message || 'Lote já registrado na base de dados.'}
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-700 font-semibold">
                    {result.imported} registros processados com sucesso!
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {result.companies?.map((c: any, i: number) => (
                      <div key={i} className="p-2.5 bg-white border border-slate-200 rounded-lg">
                        <strong className="block text-slate-800">{c.company}</strong>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {c.total} termos · <span className="text-emerald-700 font-bold">{c.verified} confirmados por CID</span> · {c.review} para revisar
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Validation & Anti-Cheating Rules */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">Garantias de Integridade</h2>

            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <ShieldCheck size={18} className="text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800 block">Hash SHA-256 Anti-Duplicação</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    O sistema gera um digest exclusivo do arquivo para impedir contagem repetida de medições.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <CheckCircle2 size={18} className="text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800 block">Validação Cruzada de CID</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    A posição numérica do CSV é checada contra o identificador oficial da ficha cadastrada.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800 block">Exclusão de Anúncios</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Resultados patrocinados ou anúncios promovidos não interferem na contagem orgânica.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-[11px] text-teal-900">
            Dica: Se você tiver o arquivo compactado <strong>resultado.zip</strong> do seu medidor local, você pode extraí-lo e importar diretamente o arquivo <strong>MEDICOES_JARES.csv</strong> aqui!
          </div>
        </div>
      </div>
    </div>
  );
};
