import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from './session';
import { useWorkspace, PageTitle } from './main';
import { Badge, Empty, Panel } from '../../../packages/ui/index';
import type { Grid, Keyword, Location, Ranking } from './types';

type Candidate = {
  name: string;
  city: string;
  address: string;
  category?: string;
  lat: number;
  lng: number;
  cid: string | null;
  placeId: string | null;
};
type Suggestion = {
  terms: { query: string; cluster: string }[];
  classification: { title: string; confidence: string };
  notice: string;
};
type Quote = {
  status: string;
  plannedTasks: number;
  keywordCount: number;
  estimatedCostUsdMicros: number | null;
  provider?: string;
  isDemo?: boolean;
};
type ProviderStatus = {
  enabled: boolean;
  provider: string;
  mode: 'LOCAL_EXPERIMENTAL' | 'SYNTHETIC_TEST' | 'COMMERCIAL';
  canResolve: boolean;
  canMeasureMaps: boolean;
  noPaidApi: boolean;
  reason: string | null;
};
type AuditProgress = {
  status: string;
  totals: { state: string; count: number }[];
  provider: string;
};

function groupsToText(rows: Suggestion['terms']) {
  const groups = new Map<string, string[]>();
  for (const row of rows) groups.set(row.cluster, [...(groups.get(row.cluster) ?? []), row.query]);
  return [...groups].map(([cluster, terms]) => `# ${cluster}\n${terms.join('\n')}`).join('\n\n');
}

/** All writes still go through the V3/V4 authenticated, tenant-scoped Fastify API. */
export function QuickMeasure() {
  const w = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [mapsUrl, setMapsUrl] = useState('');
  const [newCompany, setNewCompany] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [lookupNotice, setLookupNotice] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ name: '', city: '', address: '', lat: '', lng: '' });
  const [attested, setAttested] = useState(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [niche, setNiche] = useState('auto');
  const [services, setServices] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [limit, setLimit] = useState(40);
  const [draft, setDraft] = useState('');
  const [termNotice, setTermNotice] = useState('');
  const [termsReviewed, setTermsReviewed] = useState(false);
  const [mode, setMode] = useState<'single' | 'grid5x5'>('single');
  const [spacingM, setSpacingM] = useState(500);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [gridId, setGridId] = useState('');
  const [approveAudit, setApproveAudit] = useState(false);
  const [runId, setRunId] = useState('');
  const [issue, setIssue] = useState('');

  const selected = newCompany ? undefined : w.locations.find((item) => item.id === w.location);
  const source = useQuery({
    queryKey: ['quick-provider', w.org],
    enabled: w.signed && Boolean(w.org),
    queryFn: () => api<ProviderStatus>('/provider/status', w.org),
    refetchInterval: 15000,
  });
  const terms = useQuery({
    queryKey: ['quick-terms', w.org, w.location],
    enabled: w.signed && Boolean(w.org && w.location),
    queryFn: () => api<Keyword[]>(`/locations/${w.location}/keywords`, w.org),
  });
  const active = terms.data?.filter((x) => x.status === 'ACTIVE').length ?? 0;
  const pending = terms.data?.filter((x) => x.status === 'SUGGESTED' || x.status === 'VALIDATED').length ?? 0;
  const overLocalLimit = active * (mode === 'single' ? 1 : 25) > 100;
  const niches = useQuery({
    queryKey: ['quick-niches', w.org],
    enabled: w.signed && Boolean(w.org && w.role !== 'client_viewer'),
    queryFn: () => api<{ value: string; title: string }[]>('/niches', w.org),
  });
  const progress = useQuery({
    queryKey: ['quick-audit', w.org, runId],
    enabled: w.signed && !!runId,
    queryFn: () => api<AuditProgress>(`/audits/${runId}`, w.org),
    refetchInterval: (query) => {
      const state = query.state.data?.status;
      return ['COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED'].includes(state ?? '') ? false : 4000;
    },
  });
  const finished = ['COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED'].includes(progress.data?.status ?? '');
  const results = useQuery({
    queryKey: ['quick-rankings', w.org, w.location, runId, progress.data?.status],
    enabled: w.signed && Boolean(runId && finished && w.location),
    queryFn: () => api<Ranking>(`/locations/${w.location}/rankings`, w.org),
  });

  const run = async <T,>(task: () => Promise<T>, success?: string): Promise<T | undefined> => {
    if (busy) return undefined;
    setBusy(true);
    setIssue('');
    try {
      return await w.act(task, success);
    } catch (error) {
      setIssue(errorText(error));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  const resetAudit = () => {
    setQuote(null);
    setGridId('');
    setApproveAudit(false);
    setRunId('');
  };
  const selectLocation = (id: string) => {
    w.setLocation(id);
    resetAudit();
    setDraft('');
    setTermsReviewed(false);
  };

  async function lookupMaps() {
    setCandidates([]);
    setCandidate(null);
    setLookupNotice('');
    const response = await run(() => api<{ status: string; missing?: string[];
      partial?: Partial<Pick<Candidate, 'name' | 'city' | 'address' | 'lat' | 'lng'>>;
      candidates: Candidate[] }>(
      '/locations/resolve', w.org, { mapsUrl: mapsUrl.trim() },
    ));
    if (!response) return;
    setCandidates(response.candidates);
    if (response.partial) setManual((previous) => ({
      name: response.partial?.name ?? previous.name,
      city: response.partial?.city ?? previous.city,
      address: response.partial?.address ?? previous.address,
      lat: response.partial?.lat !== undefined ? String(response.partial.lat) : previous.lat,
      lng: response.partial?.lng !== undefined ? String(response.partial.lng) : previous.lng,
    }));
    const descriptions: Record<string, string> = {
      MAPS_BROWSER_START_FAILED: 'O Chrome de coleta não iniciou. Confira o diagnóstico local.',
      MAPS_NAVIGATION_FAILED: 'O Chrome iniciou, mas não conseguiu abrir a página da ficha.',
      MAPS_CONSENT_REQUIRED: 'O Google apresentou uma tela de consentimento no navegador de coleta.',
      MAPS_ACCESS_BLOCKED: 'O Google bloqueou ou interrompeu a pesquisa automática.',
      MAPS_IDENTITY_MISMATCH: 'O Google redirecionou para uma ficha com outro identificador.',
      MAPS_DETAILS_INCOMPLETE: 'O Maps abriu, mas faltam dados necessários para confirmar a ficha.',
      MAPS_BROWSER_BUSY: 'Já existe uma identificação em andamento. Aguarde a conclusão antes de tentar novamente.',
      PROVIDER_UNAVAILABLE: 'O coletor não está configurado ou autorizado nesta organização.',
    };
    setLookupNotice(response.candidates.length
      ? 'Confira o nome, endereço e cidade antes de cadastrar.'
      : (descriptions[response.status] ?? 'O Maps não retornou dados suficientes.') +
        (response.missing?.length ? ` Faltam: ${response.missing.join(', ')}.` : '') +
        ' Você pode informar os dados confirmados manualmente, sem posições inventadas.');
  }
  async function registerAttested() {
    if (!mapsUrl.trim() || !attested) return;
    const lat = Number(manual.lat.replace(',', '.'));
    const lng = Number(manual.lng.replace(',', '.'));
    if (!manual.name.trim() || !manual.city.trim() || !manual.address.trim() ||
        !manual.lat.trim() || !manual.lng.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setIssue('Preencha nome, cidade, endereço e coordenadas exatas que você conferiu no Google Maps.');
      return;
    }
    const result = await run(() => api<{ location: Location; created: boolean }>(
      '/locations/register-attested', w.org, {
        mapsUrl: mapsUrl.trim(), name: manual.name.trim(), city: manual.city.trim(),
        address: manual.address.trim(), lat, lng, attested: true,
      },
    ), 'Cadastro manual registrado como informação confirmada pelo operador, não pelo Google.');
    if (!result) return;
    setNewCompany(false);
    selectLocation(result.location.id);
    setManualOpen(false);
    setLookupNotice('Ficha cadastrada com CID do link e dados informados pelo operador. A coleta continua exigindo prova do cartão e do CID exatos.');
  }

  async function createLocation() {
    if (!candidate || !(candidate.cid || candidate.placeId)) return;
    // One server transaction handles create + confirm, including reusing an
    // already-registered location. No partially registered duplicate remains
    // after an error.
    const result = await run(() => api<{ location: Location; created: boolean }>(
      '/locations/register-confirmed', w.org,
      { mapsUrl: mapsUrl.trim(), externalId: candidate.cid ?? candidate.placeId },
    ), 'Identidade da ficha confirmada.');
    if (!result) return;
    setNewCompany(false);
    selectLocation(result.location.id);
    setCandidate(null);
    setCandidates([]);
    setLookupNotice(result.created
      ? 'Ficha cadastrada e confirmada. Continue com os termos.'
      : 'Esta ficha já estava cadastrada. O registro existente foi selecionado, sem duplicar a empresa.');
  }
  async function resolveExisting() {
    if (!selected) return;
    setMapsUrl(selected.maps_url);
    const response = await run(() => api<{ status: string; candidates: Candidate[] }>(
      '/locations/resolve', w.org, { mapsUrl: selected.maps_url },
    ));
    if (!response) return;
    setCandidates(response.candidates);
    if (response.candidates.length === 1) {
      const entry = response.candidates[0];
      const confirmed = await run(() => api<Location>(`/locations/${selected.id}/confirm`, w.org, {
        externalId: entry.cid ?? entry.placeId,
      }), 'Identidade confirmada no servidor.');
      if (confirmed) setLookupNotice('Identidade da ficha confirmada.');
    } else {
      setLookupNotice(response.candidates.length
        ? 'Mais de uma ficha encontrada: selecione a correta abaixo.'
        : 'O coletor não conseguiu resolver esta ficha. Nenhuma identidade será criada artificialmente.');
    }
  }
  async function confirmExisting(entry: Candidate) {
    if (!selected) return;
    const confirmed = await run(() => api<Location>(`/locations/${selected.id}/confirm`, w.org, {
      externalId: entry.cid ?? entry.placeId,
    }), 'Identidade da unidade confirmada.');
    if (confirmed) { setCandidates([]); setLookupNotice('Identidade confirmada.'); }
  }
  async function generateKeywords() {
    if (!selected) return;
    const response = await run(() => api<Suggestion>(`/locations/${selected.id}/keywords:suggest`, w.org, {
      niche, limit, products: services.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean), neighborhood: neighborhood.trim() || undefined,
    }), 'Sugestões geradas para revisão.');
    if (!response) return;
    setDraft(groupsToText(response.terms));
    setTermNotice(`${response.classification.title}: ${response.notice}`);
    setTermsReviewed(false);
    resetAudit();
  }
  async function importKeywords() {
    if (!selected || !draft.trim()) return;
    const preview = await run(() => api<{ newCount: number; duplicates: number; existingDuplicates: number }>(
      `/locations/${selected.id}/keywords:paste`, w.org, { content: draft, preview: true },
    ));
    if (!preview) return;
    const saved = await run(() => api<{ inserted: number }>(
      `/locations/${selected.id}/keywords:paste`, w.org, { content: draft, preview: false },
    ), 'Palavras-chave adicionadas como sugestões.');
    if (saved) {
      setTermNotice(`${saved.inserted} termos adicionados; ${preview.duplicates + preview.existingDuplicates} duplicados. Revise e ative apenas o que a empresa realmente oferece.`);
      setTermsReviewed(false);
      resetAudit();
      await terms.refetch();
    }
  }
  async function activateTerms() {
    if (!selected || !termsReviewed) return;
    const response = await run(() => api<{ activated: number }>(
      `/locations/${selected.id}/keywords:activate-reviewed`, w.org, { confirmed: true },
    ), 'Termos revisados e ativados.');
    if (response) { setTermNotice(`${response.activated} termos ativados.`); await terms.refetch(); resetAudit(); }
  }
  async function prepareAudit() {
    if (!selected || active === 0 || overLocalLimit || selected.identity_status !== 'CONFIRMED') return;
    setQuote(null);
    setApproveAudit(false);
    const grid = await run(() => api<Grid>(`/locations/${selected.id}/grids`, w.org, {
      mode, spacingM,
    }), 'Ponto de pesquisa configurado.');
    if (!grid) return;
    setGridId(grid.id);
    const data = await run(() => api<Quote>(`/locations/${selected.id}/audits`, w.org, {
      gridId: grid.id, surface: 'MAPS', language: 'pt-BR', device: 'desktop',
      maxProviderBudgetUsdMicros: 0, dryRun: true,
    }), 'Prévia da auditoria concluída.');
    if (data) setQuote(data);
  }
  async function startAudit() {
    if (!selected || !gridId || quote?.status !== 'PREFLIGHT_OK' || !approveAudit) return;
    const response = await run(() => api<{ runId: string }>(`/locations/${selected.id}/audits`, w.org, {
      gridId, surface: 'MAPS', language: 'pt-BR', device: 'desktop',
      maxProviderBudgetUsdMicros: quote.estimatedCostUsdMicros ?? 0, dryRun: false,
    }), 'Auditoria iniciada. Acompanhe a execução abaixo.');
    if (response?.runId) setRunId(response.runId);
  }

  if (w.role === 'client_viewer') return (
    <Panel title="Acesso restrito">Somente analistas e administradores podem criar auditorias. Use Resultados para acompanhar suas fichas.</Panel>
  );

  return <>
    <PageTitle eyebrow="FLUXO OPERACIONAL" title="Medir uma empresa"
      description="Cole a ficha do Maps, gere e aprove termos relevantes e execute uma auditoria. Tudo pelo mesmo painel." />
    <div className="quick-steps" aria-label="Etapas de medição">
      <span>01 · Identificar ficha</span><span>02 · Gerar termos</span><span>03 · Medir</span><span>04 · Ver resultado</span>
    </div>
    <div className="quick-summary" role="region" aria-label="Status do motor de medição">
      <strong>
        Motor de medição:{' '}
        {!w.signed
          ? 'Aguardando PostgreSQL e autenticação OIDC'
          : source.isLoading
            ? 'Verificando…'
            : source.data?.canMeasureMaps
              ? 'Configurado para teste local (Chrome ainda não verificado)'
              : 'Indisponível'}
      </strong>
      <small>
        {!w.signed
          ? 'Modo Preview de Interface: nenhuma medição é simulada. Conecte o banco e entre via OIDC para consultar o provedor.'
          : source.data?.mode === 'LOCAL_EXPERIMENTAL'
            ? 'Chrome local experimental · sem API paga · depende do PC ligado; resultados podem ser inconclusivos.'
            : source.data?.reason === 'PROVIDER_NOT_CONFIGURED'
              ? 'Ative e configure o coletor local antes de tentar medir. Nenhuma posição será inventada.'
              : source.data?.reason === 'RUNTIME_RESTRICTED'
                ? 'O coletor local só pode funcionar na homologação do próprio computador.'
                : source.error
                  ? errorText(source.error)
                  : 'Consultando o backend seguro.'}
      </small>
      <button
        type="button"
        disabled={source.isFetching || busy}
        onClick={() => {
          if (w.signed) void source.refetch();
          else void run(() => api<ProviderStatus>('/provider/status', w.org), 'Configuração consultada.');
        }}
      >
        Atualizar configuração do medidor
      </button>
    </div>
    {issue && <div className="error" role="alert">{issue}</div>}
    <Panel title="01 · Qual empresa vamos medir?">
      <label>Selecionar empresa já cadastrada
        <select aria-label="Empresa para medir" value={newCompany ? '' : w.location} onChange={(e) => {
          if (!e.target.value) { setNewCompany(true); setCandidates([]); setCandidate(null); }
          else { setNewCompany(false); selectLocation(e.target.value); }
        }}>
          <option value="">Cadastrar nova empresa</option>
          {w.locations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.city}</option>)}
        </select>
      </label>
      {selected && <button type="button" onClick={() => { setNewCompany(true); setCandidates([]); setCandidate(null); }}>＋ Cadastrar outra empresa</button>}
      {selected ? <div className="quick-summary">
        <strong>{selected.name}</strong><small>{selected.city} · {selected.address}{selected.primary_category ? ` · ${selected.primary_category}` : ''}</small>
        <Badge>{selected.identity_status === 'CONFIRMED' ? selected.source === 'user_attested_cid' ? 'Informações confirmadas pelo operador' : 'Ficha confirmada' : 'Identidade pendente'}</Badge>
        {selected.identity_status !== 'CONFIRMED' &&
          <button disabled={busy} onClick={() => void resolveExisting()}>Conferir identidade no Maps</button>}
      </div> : <div className="quick-new-company">
        <label>Link da ficha do Google Maps
          <input type="url" value={mapsUrl} onChange={(e) => { setMapsUrl(e.target.value); setCandidates([]); setCandidate(null); }}
            placeholder="https://www.google.com/maps/place/..." />
        </label>
        <button disabled={busy || !mapsUrl.trim() || !source.data?.canResolve} onClick={() => void lookupMaps()}>Identificar empresa pelo link</button>
        {candidate && <div className="quick-summary"><strong>{candidate.name}</strong><small>{candidate.address} · {candidate.city}{candidate.category ? ` · ${candidate.category}` : ''}</small>
          {w.locations.some((loc) =>
            (candidate.cid && loc.cid === candidate.cid) ||
            (candidate.placeId && loc.place_id === candidate.placeId))
            ? <p className="notice">Esta ficha já foi cadastrada. O sistema reutilizará o registro existente.</p>
            : null}
          <button className="primary" disabled={busy || !(candidate.cid || candidate.placeId)} onClick={() => void createLocation()}>Confirmar ficha e continuar</button>
        </div>}
      </div>}
      {lookupNotice && <p className="notice" role="status">{lookupNotice}</p>}
      {!selected && mapsUrl.trim() && !candidate && <div className="quick-summary">
        <strong>O Maps não carregou os dados?</strong>
        <small>Você pode cadastrar os dados que conferiu na ficha e o CID do link será extraído pelo servidor. Para o piloto local, a medição só receberá posição quando houver CID, nome correspondente e evidência do cartão no Maps. Nenhum ranking será presumido.</small>
        <button type="button" onClick={() => setManualOpen((value) => !value)}>
          {manualOpen ? 'Fechar cadastro manual' : 'Cadastrar com dados conferidos manualmente'}
        </button>
        {manualOpen && <div className="quick-manual">
          <div className="quick-grid">
            <label>Nome exato da ficha
              <input value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="Como aparece no Google Maps" />
            </label>
            <label>Cidade / UF
              <input value={manual.city} onChange={(e) => setManual({ ...manual, city: e.target.value })} placeholder="Ex.: Três Corações - MG" />
            </label>
          </div>
          <label>Endereço completo exibido na ficha
            <input value={manual.address} onChange={(e) => setManual({ ...manual, address: e.target.value })} />
          </label>
          <div className="quick-grid">
            <label>Latitude exata
              <input inputMode="decimal" value={manual.lat} onChange={(e) => setManual({ ...manual, lat: e.target.value })} placeholder="Ex.: -21.695012" />
            </label>
            <label>Longitude exata
              <input inputMode="decimal" value={manual.lng} onChange={(e) => setManual({ ...manual, lng: e.target.value })} placeholder="Ex.: -45.249905" />
            </label>
          </div>
          <small>Não copie automaticamente o ponto @lat,lng da URL: ele pode indicar apenas o centro da tela, não a empresa. Use a localização exata da ficha.</small>
          <label className="quick-checkbox">
            <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
            <span>Conferi pessoalmente nome, endereço, cidade, coordenadas e o link da ficha. Sei que esses dados são informados por mim, não certificados pelo Google.</span>
          </label>
          <button className="primary" type="button" disabled={busy || !attested} onClick={() => void registerAttested()}>Cadastrar ficha conferida e continuar</button>
        </div>}
      </div>}
      {candidates.length > 0 && <div className="quick-candidates">
        {candidates.map((entry, index) => <div className="unit-row" key={(entry.cid ?? entry.placeId ?? '') + index}>
          <span><strong>{entry.name}</strong><small>{entry.address} · {entry.city}{entry.category ? ` · ${entry.category}` : ''}</small></span>
          <button disabled={busy || !(entry.cid || entry.placeId)} onClick={() => {
            if (selected) void confirmExisting(entry);
            else setCandidate(entry);
          }}>{selected ? 'Confirmar esta ficha' : 'Selecionar'}</button>
        </div>)}
      </div>}
      {!selected && !mapsUrl && <p className="muted">Não há empresas fixas: cada URL cadastrada terá seus próprios termos, medições e histórico.</p>}
    </Panel>
    <Panel title="02 · Termos de pesquisa e clusters">
      {!selected ? <Empty title="Primeiro identifique a empresa">Depois geraremos palavras-chave para o nicho correto.</Empty> : <>
        <div className="quick-summary"><strong>{active} termos ativos · {pending} aguardando revisão</strong>
          <small>Você pode gerar novos termos ou continuar usando os já aprovados.</small></div>
        <div className="quick-grid">
          <label>Segmento da empresa
            <select value={niche} onChange={(e) => setNiche(e.target.value)}>
              <option value="auto">Detectar automaticamente pelo nome</option>
              {niches.data?.map((n) => <option key={n.value} value={n.value}>{n.title}</option>)}
            </select>
          </label>
          <label>Quantidade máxima
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              {[20, 40, 60, 100].map((n) => <option value={n} key={n}>{n} sugestões</option>)}
            </select>
          </label>
        </div>
        <label>Bairro confirmado da empresa (opcional)
          <input type="text" value={neighborhood} maxLength={100} onChange={(e) => setNeighborhood(e.target.value)}
            placeholder="Ex.: Centro, Tirol, Santa Cecília" />
        </label>
        <label>Serviços realmente oferecidos (opcional, separados por vírgula)
          <textarea className="quick-services" value={services} onChange={(e) => setServices(e.target.value)}
            placeholder="Informe apenas serviços confirmados pela empresa" />
        </label>
        <button disabled={busy} onClick={() => void generateKeywords()}>Gerar palavras-chave gratuitamente</button>
        <label>Revise as sugestões antes de importar
          <textarea value={draft} onChange={(e) => { setDraft(e.target.value); setTermsReviewed(false); }}
            placeholder="Clique em gerar termos, ou cole seus clusters do GPT aqui. Use # Título para separar clusters." />
        </label>
        {termNotice && <p className="notice" role="status">{termNotice}</p>}
        <div className="actions"><button disabled={busy || !draft.trim()} onClick={() => void importKeywords()}>Salvar sugestões</button>
          <Link to="/terms">Revisar termos individualmente</Link></div>
        {pending > 0 && <div className="quick-approval">
          <label className="quick-checkbox"><input type="checkbox" checked={termsReviewed} onChange={(e) => setTermsReviewed(e.target.checked)} />
            <span>Conferi os termos e confirmo que são relevantes para a empresa.</span></label>
          <button className="primary" disabled={!termsReviewed || busy} onClick={() => void activateTerms()}>Ativar {pending} termos revisados</button>
        </div>}
      </>}
    </Panel>
    <Panel title="03 · Executar medição">
      {!selected ? <Empty title="Empresa não selecionada">Cadastre uma ficha antes de medir.</Empty> : <>
        <div className="quick-summary"><strong>Fonte: Chrome local experimental</strong>
          <small>Sem custo de API, mas depende de Chrome disponível, medidor habilitado e identificação confirmada. Não é fonte licenciada para operação comercial.</small></div>
        <label>Área de medição
          <select value={mode} onChange={(e) => { setMode(e.target.value as 'single' | 'grid5x5'); resetAudit(); }}>
            <option value="single">Ponto único · como o script do terminal</option>
            <option value="grid5x5">GeoGrid 5 × 5 · 25 pontos por termo</option>
          </select>
        </label>
        {mode === 'grid5x5' && <label>Espaçamento (metros)<input type="number" min="50" max="10000" value={spacingM}
          onChange={(e) => { setSpacingM(Number(e.target.value)); resetAudit(); }} /></label>}
        {selected.identity_status !== 'CONFIRMED' && <p className="error">A ficha ainda não foi confirmada por identificador estável. Volte à etapa 1.</p>}
        {!active && <p className="error">Nenhum termo ativo. Gere, revise e aprove os termos na etapa 2.</p>}
        {overLocalLimit && <p className="error">O piloto local permite até 100 consultas por auditoria. Use ponto único ou reduza a quantidade de termos ativos.</p>}
        <button disabled={busy || !active || overLocalLimit || selected.identity_status !== 'CONFIRMED' || !source.data?.canMeasureMaps} onClick={() => void prepareAudit()}>
          Preparar {mode === 'single' ? active : active * 25} consultas e conferir disponibilidade
        </button>
        {quote && <div className="quick-quote">
          <Badge>{quote.status === 'PREFLIGHT_OK' ? 'Pronto para medir' : 'Medição indisponível'}</Badge>
          <strong>{quote.plannedTasks} pesquisas planejadas</strong>
          <small>{quote.keywordCount} palavras-chave · {mode === 'single' ? '1 ponto' : '25 pontos'} · {quote.provider ?? 'Fonte não habilitada'}</small>
          {quote.status !== 'PREFLIGHT_OK' && <p>O sistema não executará consultas fictícias. Confira a ativação do coletor no computador local.</p>}
        </div>}
        {quote?.status === 'PREFLIGHT_OK' && !runId && <div className="quick-approval">
          <label className="quick-checkbox"><input type="checkbox" checked={approveAudit} onChange={(e) => setApproveAudit(e.target.checked)} />
            <span>Autorizo esta medição experimental no navegador local.</span></label>
          <button className="primary" disabled={!approveAudit || busy} onClick={() => void startAudit()}>Medir agora</button>
        </div>}
        {runId && <div className="quick-progress" role="status">
          <strong>Auditoria: {progress.data?.status ?? 'Na fila'}</strong>
          <small>Identificador {runId}</small>
          {progress.data?.totals?.map((entry) => <span key={entry.state}>{entry.state}: {entry.count}</span>)}
          {progress.error && <p className="error">{errorText(progress.error)}</p>}
          {finished && <p>Execução encerrada. Confira os resultados e eventuais pesquisas inconclusivas.</p>}
        </div>}
      </>}
    </Panel>
    <Panel title="04 · Resultados e relatórios">
      {!runId ? <Empty title="Ainda não há medição nesta sessão">As medições anteriores ficam disponíveis em Resultados e Relatórios.</Empty> : <>
        {!finished && <p className="muted">Aguardando o worker registrar as pesquisas. O painel é atualizado automaticamente.</p>}
        {results.data && <div className="quick-metrics">
          <div><strong>{results.data.summary.verified}</strong><small>Posições verificadas</small></div>
          <div><strong>{results.data.summary.top1}</strong><small>Top 1</small></div>
          <div><strong>{results.data.summary.top3}</strong><small>Top 3</small></div>
          <div><strong>{results.data.summary.top10}</strong><small>Top 10</small></div>
        </div>}
        {results.error && <p className="error">{errorText(results.error)}</p>}
        {finished && <p className="muted">Os números acima são os indicadores atuais da unidade, não apenas desta execução.</p>}
      </>}
      <div className="actions"><Link to="/results">Abrir resultados detalhados</Link><Link to="/reports">Feedback e PDF para aprovação</Link></div>
    </Panel>
  </>;
}
