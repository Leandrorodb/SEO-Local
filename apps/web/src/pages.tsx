import { downloadRankingCsv } from './ranking-export';
import { useState, useRef, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, downloadPdf, errorText } from './session';
import { lookupMapsWithCollector } from './maps-lookup';
import { useWorkspace, PageTitle, LocationPicker } from './main';
import { Empty, Panel, Badge, Table } from '../../../packages/ui/index';
import type { Location, Keyword, Grid, Run, Ranking, Report, Organization, Rank } from './types';
import { PLAN_STRUCTURE_TEMPLATES, buildRelativeGeoGridLayout } from './preview-mode';
const date = (s: string) => new Date(s).toLocaleString('pt-BR');
const usd = (micros: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(micros / 1e6);
function values(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget));
}
function Field({
  label,
  name,
  type = 'text',
  required = true,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        step={type === 'number' ? 'any' : undefined}
      />
    </label>
  );
}
function QueryState({
  pending,
  error,
  children,
}: {
  pending: boolean;
  error: unknown;
  children: ReactNode;
}) {
  return pending ? (
    <div className="skeleton" aria-label="Carregando" />
  ) : error ? (
    <div className="error" role="alert">
      {errorText(error)}
    </div>
  ) : (
    <>{children}</>
  );
}
function NeedLocation({ children }: { children: ReactNode }) {
  const w = useWorkspace();
  if (w.location) {
    return (
      <>
        <LocationPicker />
        {children}
      </>
    );
  }
  if (!w.signed && w.previewMode) {
    return (
      <>
        <LocationPicker />
        <p className="muted" style={{ marginTop: '-8px', marginBottom: '18px' }}>
          Preview de interface sem unidade conectada · listas e métricas ficam vazias até autenticar
          com PostgreSQL e OIDC.
        </p>
        {children}
      </>
    );
  }
  return (
    <>
      <LocationPicker />
      <Empty title="Selecione uma unidade">
        Cadastre uma ficha em Empresas e unidades para continuar.
      </Empty>
    </>
  );
}
export function Locations() {
  const w = useWorkspace(),
    formRef = useRef<HTMLFormElement>(null),
    [open, setOpen] = useState(false),
    [discovery, setDiscovery] = useState<{
      url: string;
      status?: string; missing?: string[]; requestId?: string;
      items: {
        name: string; city: string; address: string;
        lat: number; lng: number; cid: string | null; placeId: string | null;
      }[];
    } | null>(null),
    [chosen, setChosen] = useState<{ url: string; externalId: string; requestId?: string } | null>(null),
    [filter, setFilter] = useState(''),
    [candidates, setCandidates] = useState<{
      id: string;
      requestId?: string;
      items: {
        name: string;
        city: string;
        address: string;
        cid: string | null;
        placeId: string | null;
      }[];
    } | null>(null);
  const brands = useQuery({
    queryKey: ['brands', w.org],
    enabled: w.signed && !!w.org && w.role !== 'client_viewer',
    queryFn: () => api<{ id: string; name: string }[]>('/brands', w.org),
  });
  async function lookup() {
    const url = (formRef.current?.elements.namedItem('mapsUrl') as HTMLInputElement | null)?.value.trim();
    if (!url) return;
    setChosen(null);
    setDiscovery(null);
    const result = await w.act(() => lookupMapsWithCollector<NonNullable<typeof discovery>['items'][number]>(w.org, url));
    if (result) setDiscovery({ url, items: result.candidates, status: result.status,
      missing: result.missing, requestId: result.requestId });
  }
  function useCandidate(candidate: NonNullable<typeof discovery>['items'][number]) {
    const form = formRef.current;
    if (!form || !discovery) return;
    const current = (form.elements.namedItem('mapsUrl') as HTMLInputElement | null)?.value.trim();
    if (current !== discovery.url) { setDiscovery(null); setChosen(null); return; }
    const fields: Record<string, string> = {
      name: candidate.name, city: candidate.city, address: candidate.address,
      lat: String(candidate.lat), lng: String(candidate.lng),
    };
    for (const [name, value] of Object.entries(fields)) {
      const input = form.elements.namedItem(name) as HTMLInputElement | null;
      if (input) input.value = value;
    }
    const externalId = candidate.cid ?? candidate.placeId;
    setChosen(externalId ? { url: discovery.url, externalId, requestId:discovery.requestId } : null);
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    const b = values(e);
    const verified = chosen && chosen.url === String(b.mapsUrl).trim();
    const location = verified
      ? await w.act(async () => (await api<{location:Location;created:boolean}>(
          '/locations/register-confirmed', w.org, {
            mapsUrl:b.mapsUrl,externalId:chosen.externalId,
            ...(chosen.requestId ? {resolveRequestId:chosen.requestId} : {}),
            ...(b.brandId ? {brandId:b.brandId} : {}),
          })).location, 'Ficha identificada e confirmada.')
      : await w.act(() => api<Location>('/locations', w.org, {
          ...(b.brandId ? { brandId: b.brandId } : {}),
          name:b.name,city:b.city,address:b.address,mapsUrl:b.mapsUrl,
          lat:Number(b.lat),lng:Number(b.lng),
        }));
    if (location) {
      w.setLocation(location.id);
      setOpen(false);
      setDiscovery(null);
      setChosen(null);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="GESTÃO DE CARTEIRA"
        title="Empresas e unidades"
        description="Uma identidade própria para cada ponto da sua operação."
        action={
          w.role !== 'client_viewer' && (
            <button className="primary" onClick={() => setOpen(!open)}>
              ＋ Cadastrar unidade
            </button>
          )
        }
      />
      {open && (
        <Panel title="Cadastrar pelo Google Maps">
          <details>
            <summary>Cadastrar marca ou rede</summary>
            <form
              onSubmit={(e) => {
                const form = e.currentTarget;
                const b = values(e);
                void w
                  .act(() => api('/brands', w.org, { name: b.brandName }), 'Marca cadastrada.')
                  .then((result) => {
                    if (result) form.reset();
                  });
              }}
            >
              <Field label="Nome da marca ou rede" name="brandName" />
              <button>Criar marca</button>
            </form>
          </details>
          <form ref={formRef} onSubmit={(e) => void save(e)} className="form-grid">
            <label>
              Marca ou rede
              <select name="brandId">
                <option value="">Unidade independente</option>
                {brands.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Link do Google Maps
              <input
                name="mapsUrl"
                type="url"
                required
                placeholder="https://www.google.com/maps?cid=…"
                onChange={() => { setDiscovery(null); setChosen(null); }}
              />
              <button type="button" onClick={() => void lookup()}>
                Buscar dados da ficha
              </button>
            </label>
            {discovery && (
              <div className="form-discovery">
                {discovery.items.length ? (
                  <>
                    <p>Confira a ficha encontrada antes de preencher os campos:</p>
                    {discovery.items.map((candidate, i) => (
                      <div key={candidate.cid ?? candidate.placeId ?? i} className="unit-row">
                        <span>
                          <strong>{candidate.name}</strong>
                          <small>{candidate.address} · {candidate.city}</small>
                        </span>
                        <button type="button" onClick={() => useCandidate(candidate)}>
                          Usar esta ficha
                        </button>
                      </div>
                    ))}
                    {chosen && <p>Dados preenchidos. Confira e clique em Salvar unidade.</p>}
                  </>
                ) : <p>A identificação automática não foi concluída ({discovery.status ?? 'sem detalhes'}).
                  {discovery.missing?.length ? ` Faltam: ${discovery.missing.join(', ')}.` : ''}
                  Preencha os dados verdadeiros manualmente. A unidade ficará pendente de identificação até uma conferência.</p>}
              </div>
            )}
            <Field label="Nome confirmado da empresa" name="name" />
            <Field label="Cidade / estado" name="city" />
            <Field label="Endereço completo" name="address" />
            <Field label="Latitude" name="lat" type="number" />
            <Field label="Longitude" name="lng" type="number" />
            <p className="muted">
              A identidade é revalidada no servidor antes de ser confirmada.
              Se a identificação automática falhar, você poderá completar os campos manualmente;
              a unidade continuará pendente até a conferência.
            </p>
            <button className="primary">Salvar unidade</button>
          </form>
        </Panel>
      )}
      <input
        aria-label="Buscar unidade"
        className="search"
        placeholder="Buscar empresa ou cidade…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <Panel>
        <Table headers={['Empresa / unidade', 'Cidade', 'Identidade', 'Ações']}>
          {w.locations
            .filter((l) => (l.name + ' ' + l.city).toLowerCase().includes(filter.toLowerCase()))
            .map((l) => (
              <tr key={l.id}>
                <td>
                  <strong>{l.name}</strong>
                  <small>{l.address}</small>
                </td>
                <td>{l.city}</td>
                <td>
                  <Badge>{l.identity_status === 'CONFIRMED' ? l.source === 'user_attested_cid' ? 'Conferida pelo operador' : 'Confirmada' : 'Pendente'}</Badge>
                </td>
                <td>
                  <button onClick={() => w.setLocation(l.id)}>
                    {w.location === l.id ? 'Selecionada' : 'Selecionar'}
                  </button>
                  {w.role !== 'client_viewer' && l.identity_status !== 'CONFIRMED' && (
                    <button
                      onClick={() =>
                        void w.act(async () => {
                          const r = await lookupMapsWithCollector<NonNullable<typeof candidates>['items'][number]>(
                            w.org, l.maps_url);
                          setCandidates({ id:l.id, items:r.candidates, requestId:r.requestId });
                          return r;
                        }, 'Consulta de identidade concluída.')
                      }
                    >
                      Resolver identidade
                    </button>
                  )}
                </td>
              </tr>
            ))}
        </Table>
        {!w.locations.length && (
          <Empty title="Nenhuma unidade cadastrada">
            Adicione o link e as informações confirmadas da empresa.
          </Empty>
        )}
      </Panel>
      {candidates && (
        <Panel title="Confirme a unidade correta">
          {candidates.items.length ? (
            candidates.items.map((c, i) => (
              <div className="unit-row" key={i}>
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {c.address} · {c.city}
                  </small>
                </span>
                <button
                  className="primary"
                  onClick={() =>
                    void w
                      .act(() =>
                        api('/locations/' + candidates.id + '/confirm', w.org, {
                          externalId: c.cid ?? c.placeId,
                          ...(candidates.requestId ? {resolveRequestId:candidates.requestId} : {}),
                        }),
                      )
                      .then(() => setCandidates(null))
                  }
                >
                  Confirmar esta unidade
                </button>
              </div>
            ))
          ) : (
            <p>
              O provedor autorizado ainda não está disponível ou não retornou candidatos. A ficha
              continua pendente.
            </p>
          )}
        </Panel>
      )}
    </>
  );
}
export function Terms() {
  const w = useWorkspace(),
    [content, setContent] = useState(''),
    [preview, setPreview] = useState<{
      terms: { term: string; cluster: string; kind: string }[];
      duplicates: number;
      newCount: number;
      existingDuplicates: number;
    } | null>(null);
  const terms = useQuery({
    queryKey: ['terms', w.org, w.location],
    queryFn: () => api<Keyword[]>('/locations/' + w.location + '/keywords', w.org),
    enabled: w.signed && !!w.location,
  });
  const [niche, setNiche] = useState('auto');
  const [products, setProducts] = useState('');
  const [termLimit, setTermLimit] = useState(40);
  const [discoveryNotice, setDiscoveryNotice] = useState('');
  const niches = useQuery({
    queryKey: ['niches', w.org],
    enabled: w.signed && !!w.org && w.role !== 'client_viewer',
    queryFn: () => api<{ value: string; title: string }[]>('/niches', w.org),
  });
  return (
    <>
      <PageTitle
        eyebrow="PESQUISA E ORGANIZAÇÃO"
        title="Termos e clusters"
        description="Gere palavras-chave automaticamente pela ficha, ou cole termos do GPT. Revise tudo antes de medir."
      />
      <NeedLocation>
        <div className="two-columns">
          <Panel title="Colar termos do GPT">
            <p className="muted">
              JSON V1 ou um termo por linha. Use # Nome do cluster para separar grupos.
            </p>
            <textarea
              aria-label="Termos do GPT"
              placeholder={'# Serviços\nserviço em cidade\n\n# Marca\nnome da empresa'}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setPreview(null);
              }}
            />
            <div className="actions">
              <button
                onClick={() =>
                  void w.act(async () => {
                    const data = await api<NonNullable<typeof preview>>(
                      '/locations/' + w.location + '/keywords:paste',
                      w.org,
                      { content, preview: true },
                    );
                    setPreview(data);
                  }, 'Prévia validada.')
                }
              >
                Validar prévia
              </button>
              <button
                className="primary"
                disabled={!preview}
                onClick={() =>
                  void w
                    .act(
                      () =>
                        api('/locations/' + w.location + '/keywords:paste', w.org, {
                          content,
                          preview: false,
                        }),
                      'Termos importados como sugestões.',
                    )
                    .then((r) => {
                      if (r) {
                        setContent('');
                        setPreview(null);
                      }
                    })
                }
              >
                Importar sugestões
              </button>
            </div>
            {preview && (
              <div className="notice">
                {preview.newCount} novos · {preview.duplicates + preview.existingDuplicates}{' '}
                duplicados
                <Table headers={['Termo', 'Cluster', 'Tipo']}>
                  {preview.terms.slice(0, 30).map((t, i) => (
                    <tr key={i}>
                      <td>{t.term}</td>
                      <td>{t.cluster}</td>
                      <td>{t.kind}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Panel>
          <Panel title="Biblioteca por nicho">
            <label>
              Nicho
              <select value={niche} onChange={(e) => setNiche(e.target.value)}>
                <option value="auto">Detectar pelo nome da ficha</option>
                {niches.data?.map((n) => (
                  <option key={n.value} value={n.value}>
                    {n.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Produtos e serviços efetivamente oferecidos
              <textarea
                value={products}
                onChange={(e) => setProducts(e.target.value)}
                placeholder="Separe por vírgula"
              />
            </label>
            <label>
              Quantidade máxima de sugestões
              <select value={termLimit} onChange={(e) => setTermLimit(Number(e.target.value))}>
                {[20, 40, 60, 100].map((n) => <option key={n} value={n}>{n} termos</option>)}
              </select>
            </label>
            <button
              onClick={() =>
                void w.act(async () => {
                  const data = await api<{
                    terms: { query: string; cluster: string }[];
                    classification: { title: string; confidence: string };
                    notice: string;
                  }>(
                    '/locations/' + w.location + '/keywords:suggest',
                    w.org,
                    {
                      niche,
                      limit: termLimit,
                      products: products
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    },
                  );
                  setDiscoveryNotice(`${data.classification.title}: ${data.notice}`);
                  const groups = data.terms.reduce((m, x) => {
                    m.set(x.cluster, [...(m.get(x.cluster) ?? []), x]);
                    return m;
                  }, new Map<string, { query: string; cluster: string }[]>());
                  setContent(
                    [...groups]
                      .map(
                        ([name, items]) =>
                          '# ' + name + '\n' + items.map((t) => t.query).join('\n'),
                      )
                      .join('\n\n'),
                  );
                  setPreview(null);
                }, 'Sugestões preparadas. Revise antes de importar.')
              }
            >
              Gerar termos automaticamente (sem IA paga)
            </button>
            {discoveryNotice && <p className="notice" role="status">{discoveryNotice}</p>}
            <p className="muted">
              Sugestões não representam volume de busca nem posição no Google.
            </p>
          </Panel>
        </div>
        <Panel title="Revisão dos termos">
          {w.role !== 'client_viewer' && Boolean(terms.data?.some((k) => ['SUGGESTED','VALIDATED'].includes(k.status))) && (
            <div className="actions">
              <button className="primary" onClick={() => {
                if (!window.confirm('Confirma que revisou as palavras-chave desta empresa? Somente termos pertinentes devem ser ativados.')) return;
                void w.act(() => api('/locations/' + w.location + '/keywords:activate-reviewed', w.org, { confirmed: true }),
                  'Todos os termos revisados foram ativados.');
              }}>✓ Aprovar e ativar os termos desta empresa</button>
            </div>
          )}
          <QueryState pending={terms.isLoading} error={terms.error}>
            <Table headers={['Pesquisa', 'Cluster', 'Tipo', 'Status', 'Revisão']}>
              {terms.data?.map((k) => (
                <tr key={k.id}>
                  <td>{k.term}</td>
                  <td>{k.cluster}</td>
                  <td>
                    <select
                      aria-label={'Tipo de ' + k.term}
                      value={k.kind}
                      onChange={(e) =>
                        void w.act(() =>
                          api(
                            '/keywords/' + k.id,
                            w.org,
                            { status: k.status, kind: e.target.value },
                            'PATCH',
                          ),
                        )
                      }
                    >
                      <option value="COMMERCIAL">Comercial</option>
                      <option value="BRAND">Marca</option>
                    </select>
                  </td>
                  <td>
                    <Badge>{k.status}</Badge>
                  </td>
                  <td>
                    <button
                      onClick={() =>
                        void w.act(() =>
                          api(
                            '/keywords/' + k.id,
                            w.org,
                            {
                              status:
                                k.status === 'SUGGESTED'
                                  ? 'VALIDATED'
                                  : k.status === 'ACTIVE'
                                    ? 'INACTIVE'
                                    : 'ACTIVE',
                            },
                            'PATCH',
                          ),
                        )
                      }
                    >
                      {k.status === 'SUGGESTED'
                        ? 'Validar'
                        : k.status === 'ACTIVE'
                          ? 'Desativar'
                          : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
            {!terms.data?.length && (
              <Empty title="Nenhum termo importado">Cole e revise os termos desta unidade.</Empty>
            )}
          </QueryState>
        </Panel>
      </NeedLocation>
    </>
  );
}
export function Audits() {
  const w = useWorkspace(),
    [gridMode, setGridMode] = useState<'single' | 'grid5x5'>('single'),
    [spacing, setSpacing] = useState(500),
    [gridId, setGridId] = useState(''),
    [surface, setSurface] = useState('MAPS'),
    [budget, setBudget] = useState(5),
    [preflight, setPreflight] = useState<{
      status: string;
      plannedTasks: number;
      keywordCount: number;
      estimatedCostUsdMicros: number | null;
      isDemo?: boolean;
      provider?: string;
    } | null>(null);
  const grids = useQuery({
    queryKey: ['grids', w.org, w.location],
    queryFn: () => api<Grid[]>('/locations/' + w.location + '/grids', w.org),
    enabled: w.signed && !!w.location,
  });
  const runs = useQuery({
    queryKey: ['runs', w.org, w.location],
    queryFn: () => api<Run[]>('/locations/' + w.location + '/audits', w.org),
    enabled: w.signed && !!w.location,
    refetchInterval: 5000,
  });
  const selected = grids.data?.find((g) => g.id === gridId) ?? grids.data?.[0];
  const input = {
    gridId: selected?.id,
    surface,
    language: 'pt-BR',
    device: 'desktop',
    maxProviderBudgetUsdMicros: Math.round(budget * 1e6),
  };
  return (
    <>
      <PageTitle
        eyebrow="ASSISTENTE DE AUDITORIA"
        title="Da pesquisa à evidência."
        description="Confirme a unidade, defina a grade e confira o orçamento antes de consultar."
      />
      <div className="steps">
        <span>01 · Unidade e identidade</span>
        <span>02 · Termos ativos</span>
        <span>03 · Grade e custo</span>
        <span>04 · Executar</span>
      </div>
      <NeedLocation>
        <div className="two-columns">
          <Panel title="Área e ponto de medição">
            <label>
              Tipo de medição
              <select value={gridMode} onChange={(e) => { setGridMode(e.target.value as 'single' | 'grid5x5'); setGridId(''); setPreflight(null); }}>
                <option value="single">Ponto único — como o medidor do terminal (vários termos)</option>
                <option value="grid5x5">GeoGrid 5 × 5 — 25 pontos por termo</option>
              </select>
            </label>
            {gridMode === 'grid5x5' && <label>
              Distância entre pontos (metros)
              <input
                type="number"
                min={50}
                max={10000}
                value={spacing}
                onChange={(e) => {
                  setSpacing(Number(e.target.value));
                  setPreflight(null);
                }}
              />
            </label>}
            <button
              onClick={() =>
                void w.act(async () => {
                  const g = await api<Grid>('/locations/' + w.location + '/grids', w.org, {
                    spacingM: spacing,
                    mode: gridMode,
                  });
                  setGridId(g.id);
                  setPreflight(null);
                }, 'Pontos de medição salvos.')
              }
            >
              {gridMode === 'single' ? 'Usar ponto único' : 'Criar GeoGrid 5×5'}
            </button>
            <label>
              Grade salva
              <select
                value={selected?.id ?? ''}
                onChange={(e) => {
                  setGridId(e.target.value);
                  setPreflight(null);
                }}
              >
                <option value="">Selecione</option>
                {grids.data?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.points.length === 1 ? 'Ponto único' : `5×5 · ${g.spacing_m} m`} · {g.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            {selected ? (
              <div className="coordinate-grid">
                {selected.points.map((p) => (
                  <div key={p.sequence} className={p.sequence === 12 ? 'center-point' : ''}>
                    <strong>P{p.sequence + 1}</strong>
                    <small>
                      {p.lat.toFixed(4)}
                      <br />
                      {p.lng.toFixed(4)}
                    </small>
                  </div>
                ))}
              </div>
            ) : gridMode === 'grid5x5' ? (
              <>
                <div
                  className="coordinate-grid"
                  aria-label="Prévia estrutural do GeoGrid 5 por 5"
                >
                  {buildRelativeGeoGridLayout(spacing).map((p) => (
                    <div key={p.sequence} className={p.sequence === 12 ? 'center-point' : ''}>
                      <strong>{p.label}</strong>
                      <small>
                        {p.sequence === 12
                          ? 'Centro'
                          : `${p.offsetNorthM >= 0 ? '+' : ''}${p.offsetNorthM}m N`}
                        <br />
                        {p.sequence === 12
                          ? '0m, 0m'
                          : `${p.offsetEastM >= 0 ? '+' : ''}${p.offsetEastM}m L`}
                      </small>
                    </div>
                  ))}
                </div>
                <p className="muted">
                  Prévia geométrica de 25 pontos ({spacing || 500} m entre eixos). As coordenadas
                  reais são calculadas no servidor somente a partir de uma unidade confirmada.
                </p>
              </>
            ) : (
              <p className="muted">
                Escolha 1 ponto para medir vários termos ou alterne para GeoGrid 5×5 para
                visualizar a malha de 25 pontos. O Chrome é experimental.
              </p>
            )}
          </Panel>
          <Panel title="Superfície e orçamento">
            <label>
              Superfície
              <select
                value={surface}
                onChange={(e) => {
                  setSurface(e.target.value);
                  setPreflight(null);
                }}
              >
                <option>MAPS</option>
                <option>LOCAL_PACK</option>
                <option>LOCAL_FINDER</option>
              </select>
            </label>
            <label>
              Orçamento máximo desta auditoria (USD)
              <input
                type="number"
                min={0}
                step="0.01"
                value={budget}
                onChange={(e) => {
                  setBudget(Number(e.target.value));
                  setPreflight(null);
                }}
              />
            </label>
            <p>Idioma: português do Brasil · Dispositivo: desktop</p>
            <button
              disabled={!selected}
              onClick={() =>
                void w.act(async () => {
                  setPreflight(
                    await api<NonNullable<typeof preflight>>(
                      '/locations/' + w.location + '/audits',
                      w.org,
                      { ...input, dryRun: true },
                    ),
                  );
                }, 'Pré-checagem concluída.')
              }
            >
              Calcular consultas e custo
            </button>
            {preflight && (
              <div className="quote">
                <Badge>
                  {preflight.status === 'PREFLIGHT_OK'
                    ? 'Orçamento disponível'
                    : 'Fonte indisponível'}
                </Badge>
                <strong>{preflight.plannedTasks} consultas</strong>
                <p>{preflight.keywordCount} termos × {selected?.points.length ?? 0} ponto(s)</p>
                <p>
                  {preflight.estimatedCostUsdMicros === null
                    ? 'Custo indisponível'
                    : usd(preflight.estimatedCostUsdMicros)}
                </p>
                {preflight.provider === 'local_chrome_preview' ? (
                  <p>EXPERIMENTAL LOCAL — Chrome visível, sem API paga. Resultado não homologado para uso comercial.</p>
                ) : preflight.isDemo ? <p>DEMO — medição sintética</p> : null}
              </div>
            )}
            <button
              className="primary"
              disabled={preflight?.status !== 'PREFLIGHT_OK'}
              onClick={() =>
                void w
                  .act(
                    () =>
                      api('/locations/' + w.location + '/audits', w.org, {
                        ...input,
                        dryRun: false,
                      }),
                    'Auditoria colocada na fila.',
                  )
                  .then(() => setPreflight(null))
              }
            >
              Confirmar e medir agora
            </button>
          </Panel>
        </div>
        <Panel title="Histórico de auditorias">
          <QueryState pending={runs.isLoading} error={runs.error}>
            <Table headers={['Data', 'Status', 'Consultas', 'Fonte', 'Custo real']}>
              {runs.data?.map((r) => (
                <tr key={r.id}>
                  <td>{date(r.created_at)}</td>
                  <td>
                    <Badge>{r.status}</Badge>
                  </td>
                  <td>{r.config_snapshot.plannedTasks}</td>
                  <td>
                    {r.provider}
                    {r.provider === 'local_chrome_preview' ? ' · EXPERIMENTAL' : r.is_demo ? ' · DEMO' : ''}
                  </td>
                  <td>{usd(Number(r.actual_cost))}</td>
                </tr>
              ))}
            </Table>
            {!runs.data?.length && (
              <Empty title="Nenhuma auditoria executada">
                A fonte e a identidade devem estar confirmadas antes de medir.
              </Empty>
            )}
          </QueryState>
        </Panel>
      </NeedLocation>
    </>
  );
}
export function Results() {
  const w = useWorkspace(),
    [surface, setSurface] = useState('MAPS'),
    [kind, setKind] = useState('COMMERCIAL'),
    [selected, setSelected] = useState('');
  const ranks = useQuery({
    queryKey: ['rankings', w.org, w.location],
    queryFn: () => api<Ranking>('/locations/' + w.location + '/rankings', w.org),
    enabled: w.signed && !!w.location,
  });
  const rows =
    ranks.data?.latest.filter(
      (x) => x.query_snapshot.surface === surface && x.query_snapshot.kind === kind,
    ) ?? [];
  const row = rows.find((x) => x.id === selected) ?? rows[0];
  const comparable = (m: Rank) =>
    row &&
    JSON.stringify([
      m.query_snapshot.term,
      m.query_snapshot.kind,
      m.query_snapshot.surface,
      m.query_snapshot.lat,
      m.query_snapshot.lng,
      m.query_snapshot.language,
      m.query_snapshot.device,
      m.provider,
      m.result_depth,
      m.query_snapshot.algorithmVersion,
      m.is_demo,
    ]) ===
      JSON.stringify([
        row.query_snapshot.term,
        row.query_snapshot.kind,
        row.query_snapshot.surface,
        row.query_snapshot.lat,
        row.query_snapshot.lng,
        row.query_snapshot.language,
        row.query_snapshot.device,
        row.provider,
        row.result_depth,
        row.query_snapshot.algorithmVersion,
        row.is_demo,
      ]);
  const history = ranks.data?.history.filter(comparable) ?? [];
  return (
    <>
      <PageTitle
        eyebrow="RESULTADOS E HISTÓRICO"
        title="Posições com contexto."
        description="Cada resultado pertence a uma pesquisa, um ponto e uma superfície."
      />
      <NeedLocation>
        <div className="filters">
          <label>
            Superfície
            <select value={surface} onChange={(e) => setSurface(e.target.value)}>
              <option>MAPS</option>
              <option>LOCAL_PACK</option>
              <option>LOCAL_FINDER</option>
            </select>
          </label>
          <label>
            Tipo de consulta
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="COMMERCIAL">Comercial</option>
              <option value="BRAND">Marca</option>
            </select>
          </label>
        </div>
        {rows.length > 0 && <div className="actions">
          <button type="button" onClick={() => downloadRankingCsv(rows)}>
            Exportar posições deste filtro (CSV)
          </button>
        </div>}
        <Panel title="Última observação de cada recorte">
          <QueryState pending={ranks.isLoading} error={ranks.error}>
            {rows.length ? (
              <Table
                headers={['Pesquisa', 'Ponto', 'Posição orgânica', 'Status', 'Fonte / momento', 'Histórico']}
              >
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.query_snapshot.term}</strong>
                      <small>{m.query_snapshot.cluster}</small>
                    </td>
                    <td>
                      {m.query_snapshot.lat.toFixed(4)}, {m.query_snapshot.lng.toFixed(4)}
                    </td>
                    <td className="rank">{m.status === 'VERIFIED' ? m.position + 'º' : '—'}</td>
                    <td>
                      <Badge>{m.status}</Badge>
                      {m.provider === 'local_chrome_preview' ? <Badge>EXPERIMENTAL</Badge> : m.is_demo && <Badge>DEMO</Badge>}
                    </td>
                    <td>
                      {m.provider}
                      <small>{date(m.observed_at)}</small>
                    </td>
                    <td>
                      <button onClick={() => setSelected(m.id)}>Comparar</button>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty title="Nenhum resultado para este recorte">
                Não há posições verificadas para mostrar.
              </Empty>
            )}
          </QueryState>
        </Panel>
        {row && (
          <Panel title={'Evolução · ' + row.query_snapshot.term}>
            <p className="muted">Mesmo ponto, superfície, idioma, dispositivo e provedor.</p>
            <HistoryChart rows={history} />
            <Table headers={['Momento', 'Posição orgânica', 'Variação', 'Status']}>
              {history.map((m) => (
                <tr key={m.id}>
                  <td>{date(m.observed_at)}</td>
                  <td>{m.position ?? '—'}</td>
                  <td>
                    {m.delta === null
                      ? '—'
                      : m.delta > 0
                        ? '↑ ' + m.delta
                        : m.delta < 0
                          ? '↓ ' + Math.abs(m.delta)
                          : '='}
                  </td>
                  <td>{m.status}</td>
                </tr>
              ))}
            </Table>
          </Panel>
        )}
      </NeedLocation>
    </>
  );
}
function HistoryChart({ rows }: { rows: Rank[] }) {
  const verified = rows.filter((r) => r.status === 'VERIFIED' && r.position !== null);
  if (verified.length < 2)
    return (
      <p className="muted">
        O gráfico aparecerá com duas ou mais observações verificadas comparáveis.
      </p>
    );
  const max = Math.max(5, ...verified.map((r) => r.position!));
  const point = (index: number, position: number) =>
    [40 + (index * 620) / (rows.length - 1), 10 + ((position - 1) * 130) / (max - 1)].join(',');
  return (
    <svg
      className="history-chart"
      viewBox="0 0 700 170"
      role="img"
      aria-label="Evolução de posições verificadas"
    >
      <line x1="40" y1="10" x2="40" y2="140" />
      <line x1="40" y1="140" x2="660" y2="140" />
      <text x="8" y="20">
        1º
      </text>
      <text x="8" y="140">
        {max}º
      </text>
      {rows.map((r, i) => {
        const previous = rows[i - 1];
        if (
          !previous ||
          previous.status !== 'VERIFIED' ||
          previous.position === null ||
          r.status !== 'VERIFIED' ||
          r.position === null
        )
          return null;
        return (
          <polyline
            key={r.id}
            points={point(i - 1, previous.position) + ' ' + point(i, r.position)}
            fill="none"
          />
        );
      })}
      {rows.map((r, i) =>
        r.status !== 'VERIFIED' || r.position === null ? null : (
          <circle
            key={r.id}
            cx={40 + (i * 620) / (rows.length - 1)}
            cy={10 + ((r.position! - 1) * 130) / (max - 1)}
            r="4"
          >
            <title>
              {date(r.observed_at)} · {r.position}º
            </title>
          </circle>
        ),
      )}
      <text x="40" y="165">
        {date(rows[0].observed_at)}
      </text>
    </svg>
  );
}
type Insight = {
  id?: string;
  measurementId?: string;
  name?: string;
  term?: string;
  position?: number;
  source?: string;
  score?: number;
  state?: string;
  suggestion?: string;
  reason?: string;
  observed_at?: string;
  is_demo?: boolean;
};
const ruleLabels = {
  newLeader: 'Novo primeiro lugar',
  repeatedDrop: 'Quedas seguidas',
  failure: 'Falha de medição',
  upcoming: 'Próxima auditoria',
  budget: 'Consumo do orçamento',
};
type RuleSettings = Record<keyof typeof ruleLabels, boolean> & { materialDrop: number };
const signalLabels: Record<string, string> = {
  NEW_TOP_1: 'Novo primeiro lugar',
  MATERIAL_DROP: 'Queda material',
  REPEATED_DROP: 'Queda repetida',
  MEASUREMENT_FAILURE: 'Falha de medição',
  UPCOMING_AUDIT: 'Próxima auditoria',
  MONTHLY_BUDGET: 'Orçamento da organização',
};
export function AlertSettings() {
  const w = useWorkspace();
  const q = useQuery({
    queryKey: ['alert-rules', w.org, w.location],
    queryFn: () => api<RuleSettings>('/locations/' + w.location + '/alert-rules', w.org),
    enabled: w.signed && !!w.location,
  });
  if (!q.data) return null;
  return (
    <details>
      <summary>Configurar alertas da unidade</summary>
      <form
        key={w.location + JSON.stringify(q.data)}
        onSubmit={(e) => {
          const b = values(e);
          void w.act(
            () =>
              api(
                '/locations/' + w.location + '/alert-rules',
                w.org,
                {
                  materialDrop: Number(b.drop),
                  ...Object.fromEntries(Object.keys(ruleLabels).map((k) => [k, b[k] === 'on'])),
                },
                'PATCH',
              ),
            'Regras de alerta salvas.',
          );
        }}
      >
        <Field
          name="drop"
          type="number"
          defaultValue={q.data.materialDrop}
          label="Queda material a partir de quantas posições?"
        />
        {(Object.keys(ruleLabels) as (keyof typeof ruleLabels)[]).map((k) => (
          <label key={k}>
            <input type="checkbox" name={k} defaultChecked={q.data![k]} />
            {ruleLabels[k]}
          </label>
        ))}
        <button>Salvar alertas</button>
      </form>
    </details>
  );
}
export function Insights({ kind }: { kind: 'competitors' | 'opportunities' }) {
  const w = useWorkspace();
  const q = useQuery({
    queryKey: [kind, w.org, w.location],
    queryFn: () => api<Insight[]>('/locations/' + w.location + '/' + kind, w.org),
    enabled: w.signed && !!w.location,
  });
  const alerts = useQuery({
    queryKey: ['alerts', w.org, w.location],
    queryFn: () =>
      api<
        {
          measurementId: string;
          kind: string;
          term: string;
          delta: number | null;
          observedAt: string;
          isDemo?: boolean;
        }[]
      >('/locations/' + w.location + '/alerts', w.org),
    enabled: w.signed && !!w.location && kind === 'opportunities',
  });
  return (
    <>
      <PageTitle
        eyebrow="INTELIGÊNCIA LOCAL"
        title={kind === 'competitors' ? 'Cenário competitivo' : 'Oportunidades e alertas'}
        description={
          kind === 'competitors'
            ? 'Observações da mesma captura, com fonte e retenção autorizadas.'
            : 'Sugestões explicáveis a partir de medições comparáveis.'
        }
      />
      <NeedLocation>
        <Panel>
          <QueryState pending={q.isLoading} error={q.error}>
            {q.data?.length ? (
              q.data.map((x, i) => (
                <div className="insight" key={x.id ?? x.measurementId ?? i}>
                  <Badge>{kind === 'competitors' ? x.position + 'º' : 'Score ' + x.score}</Badge>
                  <strong>{x.name ?? x.term}</strong>
                  <p>{x.suggestion ?? x.source}</p>
                  {x.is_demo && <Badge>DEMO</Badge>}
                  {kind === 'opportunities' && (
                    <label>
                      Andamento
                      <select
                        disabled={w.role === 'client_viewer'}
                        value={x.state ?? 'OPEN'}
                        onChange={(e) => {
                          const state = e.target.value;
                          void w.act(
                            () =>
                              api(
                                '/locations/' + w.location + '/opportunities/' + x.measurementId,
                                w.org,
                                { state },
                                'PATCH',
                              ),
                            'Ação atualizada.',
                          );
                        }}
                      >
                        <option value="OPEN" disabled>
                          Aberta
                        </option>
                        <option value="IN_PROGRESS">Em andamento</option>
                        <option value="DONE">Concluída</option>
                        <option value="DISMISSED">Descartada</option>
                      </select>
                    </label>
                  )}
                </div>
              ))
            ) : (
              <Empty
                title={
                  kind === 'competitors'
                    ? 'Nenhuma observação de concorrente'
                    : 'Sem oportunidades verificadas'
                }
              >
                Os dados aparecerão após medições válidas; sugestões não garantem melhora de
                posição.
              </Empty>
            )}
          </QueryState>
        </Panel>
        {kind === 'opportunities' && (
          <Panel title="Alertas da unidade">
            {w.role === 'org_admin' && <AlertSettings />}
            {alerts.data?.length ? (
              alerts.data.map((a) => (
                <div className="insight" key={a.measurementId + ':' + a.kind}>
                  <Badge>{signalLabels[a.kind] ?? a.kind}</Badge>
                  {a.isDemo && <Badge>DEMO</Badge>}
                  <strong>{a.term}</strong>
                  <span>{a.delta === null ? date(a.observedAt) : 'Variação: ' + a.delta}</span>
                </div>
              ))
            ) : (
              <p className="muted">Nenhuma mudança material detectada.</p>
            )}
          </Panel>
        )}
      </NeedLocation>
    </>
  );
}
export function AgencyBranding() {
  const w = useWorkspace();
  const branding = useQuery({
    queryKey: ['branding', w.org],
    queryFn: () =>
      api<{ displayName: string; logoBase64: string | null } | null>('/branding', w.org),
    enabled: w.signed && !!w.org,
  });
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const currentLogo = logo === undefined ? branding.data?.logoBase64 : logo;
  return (
    <details className="panel">
      <summary>Marca da agência nos relatórios</summary>
      <p className="muted">
        O nome e o logotipo ficam congelados em cada nova minuta aprovada. A marca do software
        permanece Local Rank Tracker.
      </p>
      <form
        className="form-grid"
        onSubmit={(e) => {
          const b = values(e);
          void w.act(
            () => api('/branding', w.org, { displayName: b.name, logoBase64: currentLogo ?? null }),
            'Marca dos relatórios salva.',
          );
        }}
      >
        <Field label="Nome da agência" name="name" defaultValue={branding.data?.displayName} />
        <label>
          Logotipo PNG (até 90 KB e 1024 × 1024)
          <input
            type="file"
            accept="image/png"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 90000) {
                w.notify('O PNG deve ter até 90 KB.');
                return;
              }
              const reader = new FileReader();
              reader.onload = () => setLogo(String(reader.result).split(',')[1]);
              reader.onerror = () => w.notify('Não foi possível ler a imagem.');
              reader.readAsDataURL(file);
            }}
          />
        </label>
        {currentLogo && (
          <img alt="Logotipo da agência" src={'data:image/png;base64,' + currentLogo} width="140" />
        )}
        <div className="actions">
          <button type="button" onClick={() => setLogo(null)}>
            Remover logotipo
          </button>
          <button className="primary">Salvar marca dos relatórios</button>
        </div>
      </form>
    </details>
  );
}
export function Reports() {
  const w = useWorkspace(),
    [selected, setSelected] = useState<Report | null>(null);
  const reports = useQuery({
    queryKey: ['reports', w.org, w.location],
    queryFn: () => api<Report[]>('/locations/' + w.location + '/reports', w.org),
    enabled: w.signed && !!w.location,
  });
  const runs = useQuery({
    queryKey: ['runs', w.org, w.location],
    queryFn: () => api<Run[]>('/locations/' + w.location + '/audits', w.org),
    enabled: w.signed && !!w.location,
    staleTime: 0,
    refetchInterval: 5000,
  });
  const [runId, setRunId] = useState('');
  async function inspect(id: string) {
    const result = await w.act(() => api<Report>('/reports/' + id, w.org), 'Relatório carregado.');
    if (result) setSelected(result);
  }
  return (
    <>
      <PageTitle
        eyebrow="COMUNICAÇÃO COM EVIDÊNCIAS"
        title="Feedbacks e relatórios"
        description="Prévia, revisão humana e aprovação antes de copiar ou baixar."
      />
      {w.role === 'org_admin' && <AgencyBranding />}
      <NeedLocation>
        {w.role !== 'client_viewer' && (
          <Panel title="Preparar minuta">
            <div className="actions">
              <select
                aria-label="Auditoria para relatório"
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
              >
                <option value="">Escolha uma auditoria concluída</option>
                {runs.data
                  ?.filter((r) => r.status.startsWith('COMPLETED'))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {date(r.created_at)}
                      {r.provider === 'local_chrome_preview' ? ' · EXPERIMENTAL' : r.is_demo ? ' · DEMO' : ''}
                    </option>
                  ))}
              </select>
              <button
                className="primary"
                disabled={!runId}
                onClick={() =>
                  void w
                    .act(
                      () => api<Report>('/locations/' + w.location + '/reports', w.org, { runId }),
                      'Minuta criada.',
                    )
                    .then((r) => {
                      if (r) void inspect(r.id);
                    })
                }
              >
                Criar minuta
              </button>
            </div>
          </Panel>
        )}
        <Panel title="Relatórios da unidade">
          <Table headers={['Criado em', 'Estado', 'Ações']}>
            {reports.data?.map((r) => (
              <tr key={r.id}>
                <td>{date(r.created_at)}</td>
                <td>
                  <Badge>{r.state}</Badge>
                </td>
                <td>
                  <button onClick={() => void inspect(r.id)}>Abrir prévia</button>
                  {r.state === 'DRAFT' && w.role !== 'client_viewer' && (
                    <button
                      onClick={() =>
                        void w.act(
                          () => api('/reports/' + r.id + '/review', w.org, {}),
                          'Enviado para revisão.',
                        )
                      }
                    >
                      Submeter à revisão
                    </button>
                  )}
                  {r.state === 'IN_REVIEW' && w.role === 'org_admin' && (
                    <button
                      onClick={() =>
                        void w.act(
                          () => api('/reports/' + r.id + '/approve', w.org, {}),
                          'Relatório aprovado.',
                        )
                      }
                    >
                      Aprovar relatório
                    </button>
                  )}
                  {r.state === 'APPROVED' && (
                    <>
                      <button
                        onClick={() => void w.act(() => downloadPdf(r.id, w.org), 'PDF baixado.')}
                      >
                        Baixar PDF
                      </button>
                      <button
                        onClick={() =>
                          void w.act(async () => {
                            const data = await api<{ text: string }>(
                              '/reports/' + r.id + '/whatsapp',
                              w.org,
                            );
                            await navigator.clipboard.writeText(data.text);
                          }, 'Feedback copiado. Envio permanece manual.')
                        }
                      >
                        Copiar WhatsApp
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          {!reports.data?.length && (
            <Empty title="Sem relatórios">
              Uma auditoria concluída e verificada permite preparar uma minuta.
            </Empty>
          )}
        </Panel>
        {selected && (
          <Panel title="Prévia do conteúdo">
            <pre className="report-preview">{selected.text}</pre>
            <small>Hash do snapshot: {selected.hash}</small>
          </Panel>
        )}
      </NeedLocation>
    </>
  );
}
export function Automation() {
  const w = useWorkspace();
  const submission = useRef<{ content: string; key: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const schedules = useQuery({
    queryKey: ['schedules', w.org],
    queryFn: () =>
      api<
        {
          id: string;
          location_id: string;
          frequency: string;
          next_run_at: string;
          enabled: boolean;
          last_error: string | null;
        }[]
      >('/audit-schedules', w.org),
    enabled: w.signed && !!w.org,
  });
  const grids = useQuery({
    queryKey: ['grids', w.org, w.location],
    queryFn: () => api<Grid[]>('/locations/' + w.location + '/grids', w.org),
    enabled: w.signed && !!w.location,
  });
  async function save(e: FormEvent<HTMLFormElement>) {
    const b = values(e);
    const form = e.currentTarget;
    const payload = {
      locationId: w.location,
      frequency: b.frequency,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      nextRunAt: new Date(String(b.start)).toISOString(),
      startNow: b.startNow === 'on',
      config: {
        gridId: b.grid,
        surface: 'MAPS',
        maxProviderBudgetUsdMicros: Math.round(Number(b.budget) * 1e6),
      },
    };
    const content = JSON.stringify(payload);
    if (submission.current?.content !== content)
      submission.current = { content, key: crypto.randomUUID() };
    const key = submission.current.key;
    setSaving(true);
    try {
      const result = await w.act(
        () => api('/audit-schedules', w.org, payload, 'POST', key),
        payload.startNow ? 'Rotina salva e primeira auditoria na fila.' : 'Rotina salva.',
      );
      if (result) {
        form.reset();
        submission.current = null;
      }
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="ROTINAS RECORRENTES"
        title="Automação com limites."
        description="Cada execução revalida licença, membership, fonte e orçamento."
      />
      <NeedLocation>
        <Panel title="Nova rotina">
          <form className="form-grid" onSubmit={(e) => void save(e)}>
            <label>
              Grade
              <select required name="grid">
                <option value="">Selecione</option>
                {grids.data?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.spacing_m} m · 25 pontos
                  </option>
                ))}
              </select>
            </label>
            <label>
              Periodicidade
              <select name="frequency">
                <option value="WEEKLY">Semanal</option>
                <option value="DAILY">Diária</option>
                <option value="MONTHLY">Mensal</option>
              </select>
            </label>
            <Field
              label="Próxima execução agendada (horário deste navegador)"
              name="start"
              type="datetime-local"
            />
            <Field
              label="Orçamento máximo por execução (USD)"
              name="budget"
              type="number"
              defaultValue={5}
            />
            <label>
              <input name="startNow" type="checkbox" />
              Executar uma auditoria ao salvar, além das recorrências. O teto acima vale para cada
              execução.
            </label>
            <button disabled={saving} className="primary">
              Salvar rotina
            </button>
            <p className="muted">
              Execuções preservam o horário UTC. Rotinas bloqueadas são desativadas com motivo para
              revisão.
            </p>
          </form>
        </Panel>
      </NeedLocation>
      <Panel title="Rotinas salvas">
        <Table headers={['Unidade', 'Periodicidade', 'Próxima execução', 'Estado', 'Ação']}>
          {schedules.data?.map((s) => (
            <tr key={s.id}>
              <td>{w.locations.find((l) => l.id === s.location_id)?.name ?? s.location_id}</td>
              <td>{s.frequency}</td>
              <td>{date(s.next_run_at)}</td>
              <td>{s.enabled ? 'Ativa' : (s.last_error ?? 'Pausada')}</td>
              <td>
                <button
                  onClick={() =>
                    void w.act(() =>
                      api('/audit-schedules/' + s.id, w.org, { enabled: !s.enabled }, 'PATCH'),
                    )
                  }
                >
                  {s.enabled ? 'Pausar' : 'Ativar'}
                </button>
              </td>
            </tr>
          ))}
        </Table>
        {!schedules.data?.length && (
          <Empty title="Nenhuma rotina salva">
            Configure uma grade e periodicidade acima após conectar uma unidade autenticada.
          </Empty>
        )}
      </Panel>
    </>
  );
}
export function Team() {
  const w = useWorkspace(),
    team = useQuery({
      queryKey: ['team', w.org],
      queryFn: () => api<{ user_id: string; role: string; status: string }[]>('/team', w.org),
      enabled: !!w.org,
    });
  return (
    <>
      <PageTitle
        eyebrow="ACESSO E PERMISSÕES"
        title="Sua equipe"
        description="Administradores, analistas e clientes com escopo explícito por unidade."
      />
      <Panel title="Vincular usuário já provisionado">
        <form
          className="form-grid"
          onSubmit={(e) => {
            const b = values(e);
            void w.act(() =>
              api('/team', w.org, {
                userId: b.user,
                role: b.role,
                locationIds: String(b.locations ?? '')
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              }),
            );
          }}
        >
          <Field label="ID do usuário provisionado pelo proprietário" name="user" />
          <label>
            Papel
            <select name="role">
              <option value="analyst">Analista</option>
              <option value="client_viewer">Cliente (leitura das unidades atribuídas)</option>
              <option value="org_admin">Administrador (MFA obrigatório)</option>
            </select>
          </label>
          <Field
            label="IDs das unidades permitidas ao cliente (vírgulas)"
            name="locations"
            required={false}
          />
          <button className="primary">Salvar associação</button>
        </form>
      </Panel>
      <Panel>
        <QueryState pending={team.isLoading} error={team.error}>
          <Table headers={['Usuário', 'Papel', 'Estado', 'Ação']}>
            {team.data?.map((u) => (
              <tr key={u.user_id}>
                <td>{u.user_id}</td>
                <td>{u.role}</td>
                <td>{u.status}</td>
                <td>
                  <button
                    disabled={u.status === 'REVOKED'}
                    onClick={() =>
                      void w.act(
                        () => api('/team/' + u.user_id + '/revoke', w.org, {}, 'PATCH'),
                        'Acesso revogado imediatamente.',
                      )
                    }
                  >
                    Revogar
                  </button>
                </td>
              </tr>
            ))}
          </Table>
          {!team.data?.length && (
            <Empty title="Nenhum usuário vinculado na organização">
              Os membros provisionados pelo proprietário e vinculados por papel aparecem aqui.
            </Empty>
          )}
        </QueryState>
      </Panel>
    </>
  );
}
export function Billing() {
  const w = useWorkspace();
  const q = useQuery({
    queryKey: ['usage', w.org],
    queryFn: () =>
      api<{
        license: {
          entitlement_status: string;
          paid_through: string;
          max_locations: number;
          max_keywords: number;
          max_monthly_queries: number;
          monthly_budget_micros: number;
        };
        ledger: { state: string; units: number; cost: number; reserved: number }[];
      }>('/usage', w.org),
    enabled: w.signed && !!w.org,
  });
  return (
    <>
      <PageTitle
        eyebrow="CONTRATO E CONSUMO"
        title="Planos e faturamento"
        description="Período pago, limites e consumo registrados no servidor."
      />
      <QueryState pending={q.isLoading} error={q.error}>
        {q.data ? (
          <>
            <div className="stats">
              <div className="stat panel">
                <span>Licença</span>
                <strong>{q.data.license.entitlement_status}</strong>
                <small>Até {date(q.data.license.paid_through)}</small>
              </div>
              <div className="stat panel">
                <span>Fichas no plano</span>
                <strong>{q.data.license.max_locations}</strong>
              </div>
              <div className="stat panel">
                <span>Termos ativos</span>
                <strong>{q.data.license.max_keywords}</strong>
              </div>
              <div className="stat panel">
                <span>Consultas por mês</span>
                <strong>{q.data.license.max_monthly_queries}</strong>
              </div>
            </div>
            <Panel title="Livro de consumo">
              <Table headers={['Estado', 'Consultas', 'Custo apurado', 'Reserva']}>
                {q.data.ledger.map((r) => (
                  <tr key={r.state}>
                    <td>{r.state}</td>
                    <td>{r.units}</td>
                    <td>{usd(Number(r.cost))}</td>
                    <td>{usd(Number(r.reserved))}</td>
                  </tr>
                ))}
              </Table>
              <p className="muted">
                Cobrança manual registrada pelo proprietário. Nenhum gateway de pagamento está
                conectado.
              </p>
            </Panel>
          </>
        ) : (
          <>
            <div className="stats">
              <div className="stat panel">
                <span>Licença</span>
                <strong>—</strong>
                <small>Sem organização conectada</small>
              </div>
              <div className="stat panel">
                <span>Fichas no plano</span>
                <strong>0</strong>
                <small>Definido no contrato</small>
              </div>
              <div className="stat panel">
                <span>Termos ativos</span>
                <strong>0</strong>
                <small>Limite por organização</small>
              </div>
              <div className="stat panel">
                <span>Consultas por mês</span>
                <strong>0</strong>
                <small>Apurado no livro de consumo</small>
              </div>
            </div>
            <Panel title="Livro de consumo">
              <Empty title="Nenhum consumo ou contrato carregado">
                Os limites e o ledger real de consultas são exibidos quando há uma organização
                autenticada no PostgreSQL.
              </Empty>
            </Panel>
          </>
        )}
      </QueryState>
      <Panel
        title="Estrutura de planos do sistema"
        subtitle="Perfis de licenciamento configuráveis pelo proprietário sem preços ou quotas inventadas."
      >
        <div className="three-columns">
          {PLAN_STRUCTURE_TEMPLATES.map((tier) => (
            <div className="plan-tier" key={tier.code}>
              <span className="plan-tier-code">{tier.code}</span>
              <h3>{tier.title}</h3>
              <p className="muted">{tier.target}</p>
              <ul>
                {tier.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
type Plan = { id: string; code: string };
export function Owner() {
  const w = useWorkspace();
  const orgs = useQuery({
    queryKey: ['owner-orgs'],
    queryFn: () => api<Organization[]>('/platform/organizations', ''),
    enabled: w.signed,
  });
  const plans = useQuery({
    queryKey: ['owner-plans'],
    queryFn: () => api<Plan[]>('/platform/plans', ''),
    enabled: w.signed,
  });
  const [target, setTarget] = useState<Organization | null>(null);
  const [tab, setTab] = useState('orgs');
  const logs = useQuery({
    queryKey: ['owner-logs'],
    queryFn: () =>
      api<{ id: string; action: string; created_at: string; resource_id: string }[]>(
        '/platform/audit-logs',
        '',
      ),
    enabled: w.signed && tab === 'logs',
  });
  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRAÇÃO DA PLATAFORMA"
        title="Console proprietário"
        description="Provisionamento, contrato e trilha de ações. MFA e reautenticação são obrigatórios."
      />
      <div className="actions">
        <button className={tab === 'orgs' ? 'primary' : ''} onClick={() => setTab('orgs')}>
          Organizações
        </button>
        <button className={tab === 'plans' ? 'primary' : ''} onClick={() => setTab('plans')}>
          Planos
        </button>
        <button className={tab === 'users' ? 'primary' : ''} onClick={() => setTab('users')}>
          Usuários
        </button>
        <button className={tab === 'logs' ? 'primary' : ''} onClick={() => setTab('logs')}>
          Auditoria de segurança
        </button>
      </div>
      <QueryState pending={orgs.isLoading} error={orgs.error}>
        {tab === 'orgs' && (
          <>
            <Panel title="Provisionar organização">
              <form
                className="form-grid"
                onSubmit={(e) => {
                  const b = values(e);
                  void w.act(() =>
                    api('/organizations', '', {
                      name: b.name,
                      slug: b.slug,
                      planId: b.plan,
                      adminSubject: b.subject,
                      adminEmail: b.email,
                      paidThrough: new Date(String(b.paid)).toISOString(),
                      reason: b.reason,
                    }),
                  );
                }}
              >
                <Field label="Nome" name="name" />
                <Field label="Slug" name="slug" />
                <label>
                  Plano
                  <select name="plan" required>
                    <option value="">Selecione</option>
                    {plans.data?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code}
                      </option>
                    ))}
                  </select>
                </label>
                <Field label="Período pago até" name="paid" type="datetime-local" />
                <Field label="Subject OIDC do administrador" name="subject" />
                <Field label="Email do administrador" name="email" type="email" />
                <Field label="Motivo / referência contratual" name="reason" />
                <button className="primary">Criar organização</button>
              </form>
            </Panel>
            <Panel title="Contratos">
              <Table headers={['Organização', 'Licença', 'Período pago', 'Ação']}>
                {orgs.data?.map((o) => (
                  <tr key={o.id}>
                    <td>{o.name}</td>
                    <td>{o.entitlement_status}</td>
                    <td>{o.paid_through ? date(o.paid_through) : '—'}</td>
                    <td>
                      <button onClick={() => setTarget(o)}>Gerenciar licença</button>
                    </td>
                  </tr>
                ))}
              </Table>
              {!orgs.data?.length && (
                <Empty title="Nenhuma organização carregada">
                  Conecte o PostgreSQL e autentique como proprietário com MFA para listar contratos.
                </Empty>
              )}
            </Panel>
            {target && (
              <Panel title={'Licença · ' + target.name}>
                <form
                  className="form-grid"
                  onSubmit={(e) => {
                    const b = values(e);
                    void w
                      .act(
                        () =>
                          api(
                            '/platform/organizations/' + target.id + '/license',
                            '',
                            {
                              expectedVersion: target.version,
                              status: b.status,
                              paidThrough: new Date(String(b.paid)).toISOString(),
                              reason: b.reason,
                              amountCents: Math.round(Number(b.amount) * 100),
                              currency: 'BRL',
                            },
                            'PATCH',
                          ),
                        'Alteração contratual registrada.',
                      )
                      .then((r) => {
                        if (r) setTarget(null);
                      });
                  }}
                >
                  <label>
                    Status
                    <select name="status">
                      <option>ACTIVE</option>
                      <option>SUSPENDED</option>
                    </select>
                  </label>
                  <Field label="Período pago até" name="paid" type="datetime-local" />
                  <Field
                    label="Valor recebido (BRL)"
                    name="amount"
                    type="number"
                    defaultValue={0}
                  />
                  <Field label="Motivo confirmado" name="reason" />
                  <button className="primary">Registrar alteração</button>
                </form>
              </Panel>
            )}
          </>
        )}
        {tab === 'plans' && (
          <Panel title="Criar plano com limites confirmados">
            <form
              className="form-grid"
              onSubmit={(e) => {
                const b = values(e);
                void w.act(() =>
                  api('/platform/plans', '', {
                    code: b.code,
                    maxLocations: Number(b.locations),
                    maxKeywords: Number(b.keywords),
                    maxMonthlyQueries: Number(b.queries),
                    maxUsers: Number(b.users),
                    monthlyBudgetMicros: Math.round(Number(b.budget) * 1e6),
                  }),
                );
              }}
            >
              <Field label="Código comercial" name="code" />
              <Field label="Máximo de fichas" name="locations" type="number" />
              <Field label="Máximo de termos ativos" name="keywords" type="number" />
              <Field label="Consultas por mês" name="queries" type="number" />
              <Field label="Usuários" name="users" type="number" />
              <Field label="Teto de custo mensal (USD)" name="budget" type="number" />
              <button className="primary">Criar plano</button>
            </form>
          </Panel>
        )}
        {tab === 'users' && (
          <Panel title="Provisionar identidade existente">
            <form
              className="form-grid"
              onSubmit={(e) => {
                const b = values(e);
                void w.act(async () => {
                  const r = await api<{ id: string }>('/platform/users', '', {
                    subject: b.subject,
                    email: b.email,
                  });
                  w.notify('Usuário criado: ' + r.id);
                  return r;
                }, 'Usuário provisionado.');
              }}
            >
              <Field label="Subject OIDC" name="subject" />
              <Field label="Email" name="email" type="email" />
              <button className="primary">Provisionar usuário</button>
            </form>
            <p className="muted">
              O usuário deve existir no provedor de identidade. Este formulário não concede acesso
              de proprietário.
            </p>
          </Panel>
        )}
        {tab === 'logs' && (
          <Panel title="Trilha de auditoria">
            <Table headers={['Quando', 'Ação', 'Recurso']}>
              {logs.data?.map((l) => (
                <tr key={l.id}>
                  <td>{date(l.created_at)}</td>
                  <td>{l.action}</td>
                  <td>{l.resource_id}</td>
                </tr>
              ))}
            </Table>
            {!logs.data?.length && (
              <Empty title="Nenhum evento de auditoria carregado">
                Os registros de segurança aparecem após autenticação OIDC do proprietário.
              </Empty>
            )}
          </Panel>
        )}
      </QueryState>
    </>
  );
}
