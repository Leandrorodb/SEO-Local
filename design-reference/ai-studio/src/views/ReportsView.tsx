import React, { useState, useEffect } from 'react';
import { Company, FeedbackReport } from '../types/nexus';
import {
  MessageSquare,
  Copy,
  Download,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  ShieldCheck,
  FileText,
  Award,
} from 'lucide-react';

interface ReportsViewProps {
  companies: Company[];
  selectedCompanyId: number | null;
  onSelectCompany: (id: number) => void;
  onExportCsv: () => void;
  showToast: (msg: string) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  companies,
  selectedCompanyId,
  onSelectCompany,
  onExportCsv,
  showToast,
}) => {
  const [report, setReport] = useState<FeedbackReport | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [humanApproved, setHumanApproved] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setHumanApproved(false);
    fetch(`/api/companies/${selectedCompanyId}/feedback`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setReport(data);
          setText(data.text || '');
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedCompanyId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Feedback copiado! Pronto para colar no WhatsApp.');
    } catch {
      showToast('Selecione e copie manualmente o texto do relatório.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);
  const verifiedMeasurements = (report?.measurements || []).filter(
    (m: any) => m.status === 'VERIFIED' && Number.isInteger(m.position)
  ).sort((a: any, b: any) => a.position - b.position);

  const top1Count = verifiedMeasurements.filter((m: any) => m.position === 1).length;
  const top3Count = verifiedMeasurements.filter((m: any) => m.position <= 3).length;
  const top5Count = verifiedMeasurements.filter((m: any) => m.position <= 5).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-extrabold text-teal-700 tracking-widest uppercase">
            Comunicação com Clientes · WhatsApp & PDF
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Feedback e Relatório de Auditoria
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Comunicação profissional e dossiê em PDF gerados exclusivamente a partir de colocações comprovadas.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onExportCsv}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition shadow-2xs flex items-center gap-1.5"
          >
            <Download size={15} />
            Baixar CSV
          </button>
          <button
            onClick={() => setShowPrintModal(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition shadow-2xs flex items-center gap-1.5"
          >
            <Printer size={15} />
            Gerar Relatório PDF
          </button>
          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition shadow-sm flex items-center gap-1.5 ${
              humanApproved ? 'bg-teal-700 hover:bg-teal-800' : 'bg-slate-800 hover:bg-slate-900'
            }`}
          >
            <Copy size={15} />
            Copiar para WhatsApp
          </button>
        </div>
      </div>

      {/* Human Approval Banner */}
      <div className={`p-4 rounded-2xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
        humanApproved 
          ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950' 
          : 'bg-amber-50/80 border-amber-300 text-amber-950'
      }`}>
        <div className="flex items-start gap-3">
          <ShieldCheck size={22} className={humanApproved ? 'text-emerald-700 mt-0.5' : 'text-amber-600 mt-0.5'} />
          <div>
            <strong className="text-xs sm:text-sm block font-extrabold">
              {humanApproved ? 'Auditoria Aprovada pelo Analista Responsável' : 'Aprovação Humana Necessária'}
            </strong>
            <p className="text-xs opacity-90 mt-0.5">
              {humanApproved 
                ? 'Os resultados foram validados e estão prontos para envio ao cliente e impressão do relatório.'
                : 'Revise os resultados e confirme que as posições refletem observações autênticas antes de enviar.'}
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer self-start sm:self-auto bg-white/80 px-4 py-2 rounded-xl border border-black/10 select-none">
          <input
            type="checkbox"
            checked={humanApproved}
            onChange={(e) => {
              setHumanApproved(e.target.checked);
              if (e.target.checked) showToast('Relatório aprovado para envio!');
            }}
            className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
          />
          <span className="text-xs font-bold text-slate-800">Aprovar Feedback</span>
        </label>
      </div>

      {/* Grid: Message Editor + Quality Criteria */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Message Editor */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Prévia da Mensagem WhatsApp</h2>
            <span className="text-xs text-slate-400">Edite o texto antes de enviar se desejar</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              Empresa / Unidade
            </label>
            <select
              value={selectedCompanyId || ''}
              onChange={(e) => onSelectCompany(Number(e.target.value))}
              className="w-full text-xs font-bold px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.city}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <textarea
              rows={18}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full text-xs font-mono p-4 bg-slate-50/70 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 leading-relaxed resize-y"
              placeholder="Carregando feedback auditado..."
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-slate-400">
              {text.length} caracteres · Formatado com negritos (*) e emojis compatíveis com WhatsApp
            </span>
            <button
              onClick={handleCopy}
              className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition shadow-sm inline-flex items-center gap-1.5 ${
                humanApproved ? 'bg-teal-700 hover:bg-teal-800' : 'bg-slate-800 hover:bg-slate-900'
              }`}
            >
              <Copy size={14} />
              Copiar Mensagem
            </button>
          </div>
        </div>

        {/* Right: Quality and Criteria */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900">Critérios de Qualidade</h2>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 bg-teal-50 rounded-xl border border-teal-200/80">
                <div className="text-2xl font-black text-teal-800">{report?.verifiedCount || 0}</div>
                <div className="text-[10px] font-bold text-teal-600 mt-0.5">Posições Confirmadas</div>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80">
                <div className="text-2xl font-black text-amber-800">{report?.reviewCount || 0}</div>
                <div className="text-[10px] font-bold text-amber-700 mt-0.5">Em Conferência</div>
              </div>
            </div>

            <div className="space-y-3 pt-2 text-xs">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <CheckCircle2 size={16} className="text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800 block">ID do perfil comprovado por CID</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Apenas essas palavras-chave entram na lista de 1º, 2º e 3º lugares.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800 block">Correspondência por nome exige revisão</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Nunca anunciamos conquistas para o cliente antes de validação por um analista.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <Clock size={16} className="text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800 block">Momento e localização importam</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    O relatório explica de forma transparente que posições são observações auditadas, não garantias municipais permanentes.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => setShowPrintModal(true)}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition flex items-center justify-center gap-2"
            >
              <FileText size={15} />
              Visualizar Relatório Executivo em PDF
            </button>
            <div className="p-3 rounded-xl bg-slate-50 text-[11px] text-slate-400 border border-slate-200 leading-relaxed text-center">
              Nenhuma mensagem é enviada automaticamente para o WhatsApp do cliente. Você copia após conferência.
            </div>
          </div>
        </div>
      </div>

      {/* PDF / Print Dossier Modal */}
      {showPrintModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPrintModal(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-scale-in">
            {/* Modal Control Bar (Excluded from print) */}
            <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between shrink-0 print:hidden">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-teal-400" />
                <span className="text-sm font-bold">Relatório Executivo de Auditoria SEO Local</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Printer size={14} />
                  Imprimir / Salvar como PDF
                </button>
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div className="p-8 sm:p-12 space-y-8 bg-white text-slate-900 overflow-y-auto print:p-0 flex-1">
              {/* Document Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-6 gap-4">
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-widest text-teal-700">
                    NEXUS RANK TRACKER · AUDITORIA OFICIAL
                  </div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight mt-1">
                    {selectedCompany?.name || 'Empresa'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 font-medium">
                    Unidade: {selectedCompany?.city} · Coordenadas: {selectedCompany?.latitude}, {selectedCompany?.longitude}
                  </p>
                  {selectedCompany?.cid && (
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      CID Verificado: {selectedCompany.cid}
                    </p>
                  )}
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-xs font-bold text-slate-400">DATA DA AUDITORIA</div>
                  <div className="text-sm font-extrabold text-slate-800 mt-0.5">
                    {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </div>
                  <div className="inline-block px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md text-[10px] font-bold mt-2">
                    STATUS: APROVADO & VERIFICADO
                  </div>
                </div>
              </div>

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-center">
                  <div className="text-2xl font-black text-slate-900">{report?.total || 0}</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Termos Auditados</div>
                </div>
                <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/50 text-center">
                  <div className="text-2xl font-black text-teal-800">{top1Count}</div>
                  <div className="text-[10px] font-bold text-teal-700 uppercase tracking-wider mt-1">1º Lugar Absoluto 🥇</div>
                </div>
                <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/50 text-center">
                  <div className="text-2xl font-black text-teal-800">{top3Count}</div>
                  <div className="text-[10px] font-bold text-teal-700 uppercase tracking-wider mt-1">No Top 3 (Local Pack) 🥉</div>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-center">
                  <div className="text-2xl font-black text-slate-900">{top5Count}</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">No Top 5 📈</div>
                </div>
              </div>

              {/* Verified Positions Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Conquistas Auditadas no Google Maps
                  </h3>
                  <span className="text-xs text-slate-400">
                    {verifiedMeasurements.length} termos com CID estrito comprovado
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-4">Posição</th>
                        <th className="py-2.5 px-4">Termo Pesquisado</th>
                        <th className="py-2.5 px-4">Cluster Comercial</th>
                        <th className="py-2.5 px-4 text-center">Prioridade</th>
                        <th className="py-2.5 px-4 text-right">Comprovação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {verifiedMeasurements.map((m: any) => (
                        <tr key={m.id} className="hover:bg-slate-50/50">
                          <td className="py-2 px-4 font-black">
                            {m.position === 1 ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">🥇 1º Lugar</span>
                            ) : m.position <= 3 ? (
                              <span className="inline-flex items-center gap-1 text-teal-700 font-bold">🥉 {m.position}º Lugar</span>
                            ) : (
                              <span className="text-slate-600 font-bold">{m.position}º Lugar</span>
                            )}
                          </td>
                          <td className="py-2 px-4 font-semibold text-slate-900">{m.query}</td>
                          <td className="py-2 px-4 text-slate-600">{m.cluster}</td>
                          <td className="py-2 px-4 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                              {m.priority}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-right">
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                              CID Validado
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Methodology & Legal Notice */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-[11px] text-slate-500 space-y-1 leading-relaxed">
                <strong className="text-slate-800 block">Metodologia e Transparência:</strong>
                <p>
                  As posições acima foram capturadas através de observação de busca orgânica sem anúncios patrocinados, utilizando coordenadas geográficas da cidade de referência e validação estrita do identificador CID da ficha da empresa. Os resultados refletem o momento da auditoria e respeitam os limites técnicos de variação algorítmica por geolocalização.
                </p>
              </div>

              {/* Auditor Sign-off */}
              <div className="pt-6 border-t flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
                <div>
                  <span className="font-bold text-slate-800">Analista Responsável:</span> Equipe de Operações NEXUS
                </div>
                <div>
                  <span className="font-bold text-slate-800">Emissão:</span> Sistema Automatizado Local Rank Tracker V3
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
