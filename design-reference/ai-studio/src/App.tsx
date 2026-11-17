import React, { useState, useEffect, useCallback } from 'react';
import { ViewType, Company, Term, Run, Measurement, Summary, Priority } from './types/nexus';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { OverviewView } from './views/OverviewView';
import { CompaniesView } from './views/CompaniesView';
import { TermsView } from './views/TermsView';
import { MeasurementsView } from './views/MeasurementsView';
import { ReviewView } from './views/ReviewView';
import { ReportsView } from './views/ReportsView';
import { ImportView } from './views/ImportView';
import { CollectorView } from './views/CollectorView';
import { SettingsView } from './views/SettingsView';
import { CompanyModal } from './components/CompanyModal';
import { TermModal } from './components/TermModal';
import { BatchModal } from './components/BatchModal';
import { KeywordSuggestModal } from './components/KeywordSuggestModal';
import { EvidenceModal } from './components/EvidenceModal';
import { ImportMapsUrlModal } from './components/ImportMapsUrlModal';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  const [terms, setTerms] = useState<Term[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [previousRun, setPreviousRun] = useState<Run | null>(null);

  // Modals state
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [importMapsModalOpen, setImportMapsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [termModalOpen, setTermModalOpen] = useState(false);
  const [batchModal, setBatchModal] = useState<{ open: boolean; type: 'companies' | 'terms' }>({
    open: false,
    type: 'companies',
  });
  const [suggestModalOpen, setSuggestModalOpen] = useState(false);
  const [evidenceMeasurement, setEvidenceMeasurement] = useState<Measurement | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 4500);
  }, []);

  // Fetch summary and companies
  const reloadBase = useCallback(async () => {
    try {
      const [compsRes, sumRes] = await Promise.all([
        fetch('/api/companies'),
        fetch('/api/summary'),
      ]);
      const comps = await compsRes.json();
      const sum = await sumRes.json();

      if (Array.isArray(comps)) {
        setCompanies(comps);
        setSelectedCompanyId((prev) => {
          if (!prev && comps.length > 0) return comps[0].id;
          if (prev && !comps.some((c: Company) => c.id === prev)) return comps[0]?.id || null;
          return prev;
        });
      }
      if (!sum.error) setSummary(sum);
    } catch (err) {
      console.error('Falha ao carregar dados:', err);
    }
  }, []);

  // Fetch company details (terms, runs)
  const reloadSelected = useCallback(async () => {
    if (!selectedCompanyId) {
      setTerms([]);
      setRuns([]);
      setRun(null);
      setPreviousRun(null);
      return;
    }

    try {
      const [termsRes, runsRes] = await Promise.all([
        fetch(`/api/companies/${selectedCompanyId}/terms`),
        fetch(`/api/companies/${selectedCompanyId}/runs`),
      ]);
      const termsData = await termsRes.json();
      const runsData = await runsRes.json();

      if (Array.isArray(termsData)) setTerms(termsData);
      if (Array.isArray(runsData)) {
        setRuns(runsData);
        setSelectedRunId((prev) => {
          if (!prev && runsData.length > 0) return runsData[0].id;
          if (prev && !runsData.some((r: Run) => r.id === prev)) return runsData[0]?.id || null;
          return prev;
        });
      }
    } catch (e) {
      console.error('Falha ao carregar dados da empresa:', e);
    }
  }, [selectedCompanyId]);

  // Load specific run measurements and prior run comparison
  useEffect(() => {
    if (!selectedRunId) {
      setRun(null);
      setPreviousRun(null);
      return;
    }

    const curIndex = runs.findIndex((r) => r.id === selectedRunId);
    const prior = curIndex >= 0 ? runs[curIndex + 1] : null;

    Promise.all([
      fetch(`/api/runs/${selectedRunId}`).then((r) => r.json()),
      prior ? fetch(`/api/runs/${prior.id}`).then((r) => r.json()) : Promise.resolve(null),
    ])
      .then(([currentData, priorData]) => {
        if (!currentData.error) setRun(currentData);
        if (priorData && !priorData.error) setPreviousRun(priorData);
        else setPreviousRun(null);
      })
      .catch(console.error);
  }, [selectedRunId, runs]);

  useEffect(() => {
    reloadBase();
  }, [reloadBase]);

  useEffect(() => {
    reloadSelected();
  }, [reloadSelected]);

  // Polling for running audit tasks
  useEffect(() => {
    const isRunning = run?.status === 'RUNNING' || run?.status === 'QUEUED';
    if (!isRunning) return;

    const interval = setInterval(() => {
      reloadBase();
      reloadSelected();
    }, 3500);

    return () => clearInterval(interval);
  }, [run?.status, reloadBase, reloadSelected]);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || null;

  // Handlers
  const handleSaveCompany = async (data: Partial<Company>) => {
    const isEdit = !!editingCompany;
    const url = isEdit ? `/api/companies/${editingCompany.id}` : '/api/companies';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao salvar empresa');

    showToast(isEdit ? 'Empresa atualizada!' : 'Empresa cadastrada com sucesso!');
    await reloadBase();
    if (!isEdit && result.id) setSelectedCompanyId(result.id);
  };

  const handleDeleteCompany = async (id: number) => {
    if (!confirm('Deseja realmente excluir esta empresa e todos os termos vinculados?')) return;
    try {
      const res = await fetch(`/api/companies/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Empresa excluída com sucesso.');
        await reloadBase();
      }
    } catch (e: any) {
      showToast(e.message || 'Erro ao excluir');
    }
  };

  const handleAddTerm = async (data: { query: string; cluster: string; priority: Priority }) => {
    if (!selectedCompanyId) return;
    const res = await fetch(`/api/companies/${selectedCompanyId}/terms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao cadastrar termo');

    showToast('Pesquisa adicionada ao catálogo!');
    await reloadSelected();
    await reloadBase();
  };

  const handleDeleteTerm = async (id: number) => {
    if (!confirm('Deseja excluir esta pesquisa?')) return;
    try {
      const res = await fetch(`/api/terms/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Pesquisa excluída.');
        await reloadSelected();
        await reloadBase();
      }
    } catch (e: any) {
      showToast(e.message || 'Erro ao excluir termo');
    }
  };

  const handleBatchImport = async (text: string) => {
    if (batchModal.type === 'companies') {
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const batch = lines.map((l) => {
        const [name, city, latitude, longitude, cid = ''] = l.split(';');
        return { name: name?.trim(), city: city?.trim(), latitude, longitude, cid: cid.trim() };
      });
      const res = await fetch('/api/companies/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies: batch }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Erro ao importar empresas');
      showToast(`${result.inserted} empresas importadas com sucesso!`);
      await reloadBase();
    } else {
      if (!selectedCompanyId) return;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const termsList = lines.map((l) => {
        const [query, cluster = 'Geral', priority = 'P2'] = l.split(';');
        return {
          query: query?.trim(),
          cluster: cluster?.trim(),
          priority: priority?.trim().toUpperCase(),
        };
      });
      const res = await fetch(`/api/companies/${selectedCompanyId}/terms/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms: termsList }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Erro ao importar termos');
      showToast(`${result.inserted} pesquisas importadas!`);
      await reloadSelected();
      await reloadBase();
    }
  };

  const handleStartRun = async (mode: 'priority' | 'all') => {
    if (!selectedCompanyId) return;
    const res = await fetch(`/api/companies/${selectedCompanyId}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao iniciar medição');

    showToast(`Medição #${result.runId} iniciada!`);
    await reloadSelected();
    await reloadBase();
  };

  const handleReviewDecision = async (id: number, decision: 'confirm' | 'reject', note?: string) => {
    const res = await fetch(`/api/measurements/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, note }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erro ao salvar revisão');

    showToast(decision === 'confirm' ? 'Posição auditada e confirmada!' : 'Correspondência rejeitada.');
    await reloadSelected();
    await reloadBase();
  };

  const handleExportCsv = () => {
    if (selectedCompanyId) {
      window.open(`/api/companies/${selectedCompanyId}/export`, '_blank');
    }
  };

  const handleDownloadCollectorPayload = () => {
    if (selectedCompanyId) {
      window.open(`/api/companies/${selectedCompanyId}/collector-payload`, '_blank');
    }
  };

  return (
    <div className="flex h-screen bg-[#f5f7f7] font-sans antialiased text-[#172b32] overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        companiesCount={companies.length}
        reviewCount={summary?.reviews || 0}
        isOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Topbar
          currentView={currentView}
          selectedCompany={selectedCompany}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onNavigate={setCurrentView}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {currentView === 'overview' && (
            <OverviewView
              summary={summary}
              companies={companies}
              onNavigate={setCurrentView}
              onSelectCompany={(id) => {
                setSelectedCompanyId(id);
                setCurrentView('measurements');
              }}
              onNewCompany={() => {
                setEditingCompany(null);
                setCompanyModalOpen(true);
              }}
              onImportFromMapsUrl={() => setImportMapsModalOpen(true)}
            />
          )}

          {currentView === 'companies' && (
            <CompaniesView
              companies={companies}
              onSelectCompany={(id) => {
                setSelectedCompanyId(id);
                setCurrentView('measurements');
              }}
              onNewCompany={() => {
                setEditingCompany(null);
                setCompanyModalOpen(true);
              }}
              onImportFromMapsUrl={() => setImportMapsModalOpen(true)}
              onBatchCompanies={() => setBatchModal({ open: true, type: 'companies' })}
              onEditCompany={(comp) => {
                setEditingCompany(comp);
                setCompanyModalOpen(true);
              }}
              onDeleteCompany={handleDeleteCompany}
              onNavigate={setCurrentView}
            />
          )}

          {currentView === 'terms' && (
            <TermsView
              companies={companies}
              selectedCompanyId={selectedCompanyId}
              onSelectCompany={setSelectedCompanyId}
              terms={terms}
              onAddTerm={() => setTermModalOpen(true)}
              onBatchTerms={() => setBatchModal({ open: true, type: 'terms' })}
              onSuggestKeywords={() => setSuggestModalOpen(true)}
              onDeleteTerm={handleDeleteTerm}
            />
          )}

          {currentView === 'measurements' && (
            <MeasurementsView
              companies={companies}
              selectedCompanyId={selectedCompanyId}
              onSelectCompany={setSelectedCompanyId}
              run={run}
              previousRun={previousRun}
              runs={runs}
              selectedRunId={selectedRunId}
              onSelectRun={setSelectedRunId}
              onStartRun={handleStartRun}
              onExportCsv={handleExportCsv}
              onDownloadCollectorPayload={handleDownloadCollectorPayload}
              onOpenEvidence={setEvidenceMeasurement}
            />
          )}

          {currentView === 'reviews' && (
            <ReviewView
              onOpenEvidence={setEvidenceMeasurement}
              onRefreshAll={async () => {
                await reloadBase();
                await reloadSelected();
              }}
            />
          )}

          {currentView === 'reports' && (
            <ReportsView
              companies={companies}
              selectedCompanyId={selectedCompanyId}
              onSelectCompany={setSelectedCompanyId}
              onExportCsv={handleExportCsv}
              showToast={showToast}
            />
          )}

          {currentView === 'import' && (
            <ImportView
              onRefreshAll={async () => {
                await reloadBase();
                await reloadSelected();
              }}
              showToast={showToast}
            />
          )}

          {currentView === 'collector' && (
            <CollectorView
              companies={companies}
              selectedCompanyId={selectedCompanyId}
              onSelectCompany={setSelectedCompanyId}
              onDownloadCollectorPayload={handleDownloadCollectorPayload}
            />
          )}

          {currentView === 'settings' && (
            <SettingsView
              onRefreshAll={async () => {
                await reloadBase();
                await reloadSelected();
              }}
              showToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#162c34] border border-[#2b4d54] text-white px-5 py-3.5 rounded-2xl shadow-2xl text-xs font-semibold animate-slide-up flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[#4be0ae]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modals */}
      {companyModalOpen && (
        <CompanyModal
          company={editingCompany}
          onClose={() => setCompanyModalOpen(false)}
          onSave={handleSaveCompany}
        />
      )}

      {termModalOpen && selectedCompany && (
        <TermModal
          companyName={selectedCompany.name}
          onClose={() => setTermModalOpen(false)}
          onSave={handleAddTerm}
        />
      )}

      {batchModal.open && (
        <BatchModal
          type={batchModal.type}
          companyName={selectedCompany?.name}
          onClose={() => setBatchModal({ open: false, type: 'companies' })}
          onImport={handleBatchImport}
        />
      )}

      {suggestModalOpen && selectedCompany && (
        <KeywordSuggestModal
          company={selectedCompany}
          onClose={() => setSuggestModalOpen(false)}
          onImportTerms={async (newTerms) => {
            const res = await fetch(`/api/companies/${selectedCompany.id}/terms/batch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ terms: newTerms }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Erro ao importar termos');
            showToast(`${result.inserted} termos sugeridos importados!`);
            await reloadSelected();
            await reloadBase();
          }}
        />
      )}

      {evidenceMeasurement && (
        <EvidenceModal
          measurement={evidenceMeasurement}
          onClose={() => setEvidenceMeasurement(null)}
          onReviewDecision={handleReviewDecision}
        />
      )}

      {importMapsModalOpen && (
        <ImportMapsUrlModal
          onClose={() => setImportMapsModalOpen(false)}
          onSuccess={async (newCompany) => {
            showToast(`Ficha "${newCompany.name}" importada com sucesso!`);
            await reloadBase();
            setSelectedCompanyId(newCompany.id);
            setCurrentView('measurements');
          }}
        />
      )}
    </div>
  );
}
