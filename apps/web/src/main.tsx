import { useEffect, useState, createContext, useContext, useCallback, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  NavLink,
  Routes,
  Route,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  identity,
  identityConfigured,
  identityIssue,
  oidcAuthority,
  setBearer,
  api,
  ApiError,
  authErrorText,
  errorText,
} from './session';
import { parseApiHealthPayload, type ApiHealthState } from './auth-config';
import {
  UI_PREVIEW_STORAGE_KEY,
  buildSetupReadinessChecklist,
  isUiPreviewAllowed,
  resolveInitialPreviewMode,
} from './preview-mode';
import type { Location, Me, Ranking } from './types';
import { Empty, Panel, Badge } from '../../../packages/ui/index';
import { NavIcon, type NavIconName } from './components/Icons';
import { SettingsView } from './components/SettingsView';
import { QuickMeasure } from './quick-measure';
import {
  Locations,
  Terms,
  Audits,
  Results,
  Insights,
  Reports,
  Automation,
  Team,
  Billing,
  Owner,
} from './pages';
import './styles.css';

type Workspace = {
  org: string;
  location: string;
  locations: Location[];
  role: string;
  signed: boolean;
  previewMode: boolean;
  theme: string;
  apiHealth: ApiHealthState;
  setTheme: (next: string) => void;
  setLocation: (id: string) => void;
  notify: (s: string) => void;
  act: <T>(fn: () => Promise<T>, message?: string) => Promise<T | undefined>;
  exitPreview: () => void;
  refreshHealth: () => Promise<void>;
};

export const workspace = createContext<Workspace>(null!);
export const useWorkspace = () => useContext(workspace);

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 10000, refetchOnWindowFocus: true } },
});

type NavItem = {
  path: string;
  icon: NavIconName;
  label: string;
  group: 'Operação' | 'Análise & Entrega' | 'Governança';
};

const navigationItems: NavItem[] = [
  { path: '/', icon: 'overview', label: 'Visão geral', group: 'Operação' },
  { path: '/measure', icon: 'measure', label: 'Medir empresa', group: 'Operação' },
  { path: '/locations', icon: 'locations', label: 'Empresas e unidades', group: 'Operação' },
  { path: '/terms', icon: 'terms', label: 'Termos e clusters', group: 'Operação' },
  { path: '/audits', icon: 'geogrid', label: 'Nova auditoria', group: 'Operação' },
  { path: '/results', icon: 'results', label: 'Resultados', group: 'Análise & Entrega' },
  { path: '/competitors', icon: 'competitors', label: 'Concorrentes', group: 'Análise & Entrega' },
  {
    path: '/opportunities',
    icon: 'opportunities',
    label: 'Oportunidades',
    group: 'Análise & Entrega',
  },
  { path: '/reports', icon: 'reports', label: 'Feedbacks e relatórios', group: 'Análise & Entrega' },
  { path: '/automation', icon: 'automation', label: 'Automação', group: 'Governança' },
  { path: '/team', icon: 'team', label: 'Equipe', group: 'Governança' },
  { path: '/billing', icon: 'billing', label: 'Faturamento', group: 'Governança' },
  { path: '/settings', icon: 'settings', label: 'Configurações', group: 'Governança' },
];

const NAV_GROUPS: NavItem['group'][] = ['Operação', 'Análise & Entrega', 'Governança'];

function App() {
  // An explicitly built review release exposes empty, read-only UI, never an
  // authenticated workspace or fabricated metrics. APIs still require tokens.
  const reviewBuild = import.meta.env.VITE_REVIEW_BUILD === 'READ_ONLY';
  const previewAllowed = reviewBuild || isUiPreviewAllowed(window.location.hostname, import.meta.env.DEV);
  const [ready, setReady] = useState(false),
    [signed, setSigned] = useState(false),
    [previewMode, setPreviewMode] = useState(() =>
      resolveInitialPreviewMode({
        allowed: previewAllowed,
        search: window.location.search,
        storedValue: sessionStorage.getItem(UI_PREVIEW_STORAGE_KEY),
      }),
    ),
    [loginError, setLoginError] = useState(''),
    [apiHealth, setApiHealth] = useState<ApiHealthState>({ status: 'checking' }),
    [org, setOrg] = useState(''),
    [location, setLocation] = useState(''),
    [notice, setNotice] = useState(''),
    [mobileNavOpen, setMobileNavOpen] = useState(false),
    [theme, setTheme] = useState(localStorage.getItem('lrt-theme') ?? 'dark');

  const navigate = useNavigate(),
    routeLocation = useLocation(),
    cache = useQueryClient();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('lrt-theme', theme);
  }, [theme]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [routeLocation.pathname]);

  const refreshHealth = useCallback(async () => {
    try {
      const res = await fetch('/health');
      const text = await res.text();
      setApiHealth(parseApiHealthPayload(res.status, res.headers.get('content-type'), text));
    } catch {
      setApiHealth({
        status: 'unavailable',
        reason: 'Não foi possível alcançar /health no servidor integrado da aplicação.',
      });
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth, signed]);

  useEffect(() => {
    // Auto-login exclusively in the explicitly opted-in Windows local build.
    if (
      import.meta.env.VITE_LOCAL_EASY_LOGIN !== 'LOCAL_MACHINE_ONLY' ||
      window.location.hostname !== '127.0.0.1'
    )
      return;
    if (
      !ready ||
      signed ||
      loginError ||
      !identity ||
      window.location.pathname === '/auth/callback'
    )
      return;
    if (sessionStorage.getItem('lrt-local-login-attempted') === '1') return;
    sessionStorage.setItem('lrt-local-login-attempted', '1');
    void identity.signinRedirect().catch((e) => setLoginError(authErrorText(e)));
  }, [ready, signed, loginError]);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const user =
          locationPath() === '/auth/callback'
            ? await identity?.signinRedirectCallback()
            : await identity?.getUser();
        if (user && !user.expired) {
          setBearer(user.id_token ?? user.access_token);
          if (active) {
            setSigned(true);
            setPreviewMode(false);
            sessionStorage.removeItem(UI_PREVIEW_STORAGE_KEY);
          }
          if (locationPath() === '/auth/callback') navigate('/', { replace: true });
        }
      } catch (e) {
        setLoginError(authErrorText(e));
      } finally {
        if (active) setReady(true);
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, [navigate]);

  const me = useQuery({
    queryKey: ['me', signed],
    queryFn: () => api<Me>('/me/organizations', ''),
    enabled: signed,
  });

  useEffect(() => {
    if (me.data && !org && me.data.organizations[0]) setOrg(me.data.organizations[0].id);
  }, [me.data, org]);

  const locations = useQuery({
    queryKey: ['locations', org],
    queryFn: () => api<Location[]>('/locations', org),
    enabled: signed && !!org,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (locations.data && !locations.data.some((l) => l.id === location))
      setLocation(locations.data[0]?.id ?? '');
  }, [locations.data, location]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const role = me.data?.organizations.find((x) => x.id === org)?.role ?? '';

  function enterPreview() {
    if (!previewAllowed) return;
    sessionStorage.setItem(UI_PREVIEW_STORAGE_KEY, '1');
    setPreviewMode(true);
  }

  function exitPreview() {
    sessionStorage.removeItem(UI_PREVIEW_STORAGE_KEY);
    setPreviewMode(false);
    setNotice('');
  }

  async function login(recent = false) {
    setLoginError('');
    try {
      await identity?.signinRedirect(recent ? { prompt: 'login', max_age: 0 } : {});
    } catch (e) {
      setLoginError(authErrorText(e));
    }
  }

  async function logout() {
    setBearer(null);
    setSigned(false);
    setOrg('');
    setLocation('');
    cache.clear();
    await identity?.removeUser();
  }

  async function act<T>(fn: () => Promise<T>, message = 'Alteração salva.') {
    try {
      const result = await fn();
      await cache.invalidateQueries();
      setNotice(message);
      return result;
    } catch (e) {
      setNotice(errorText(e));
      if (e instanceof ApiError && e.status === 402) {
        cache.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
        await locations.refetch();
      }
      return undefined;
    }
  }

  if (!ready)
    return (
      <div className="login">
        <div>
          <h1>Local Rank Tracker</h1>
          <p className="muted">Restaurando sessão…</p>
        </div>
      </div>
    );

  const showWorkspace = signed || (previewAllowed && previewMode);

  if (!showWorkspace)
    return (
      <div className="login">
        <div className="login-art">
          <span className="eyebrow">INTELIGÊNCIA LOCAL · EVIDÊNCIAS REAIS</span>
          <h1>
            Conheça sua
            <br />
            posição.
            <br />
            <em>
              Planeje o próximo
              <br />
              movimento.
            </em>
          </h1>
          <p>
            Organize suas unidades, acompanhe pesquisas locais e transforme medições verificadas em
            decisões.
          </p>
          <div className="orb">◎</div>
        </div>
        <section className="login-card">
          <div className="brand">
            <span className="mark">L↗</span>
            <strong>
              Local Rank
              <br />
              <span>Tracker</span>
            </strong>
          </div>
          <h2>Seu espaço de inteligência.</h2>
          <p>Acesse a organização vinculada ao seu usuário.</p>

          {identityConfigured ? (
            <button className="primary" onClick={() => void login()}>
              {import.meta.env.VITE_LOCAL_EASY_LOGIN === 'LOCAL_MACHINE_ONLY'
                ? 'Entrar neste computador →'
                : 'Entrar com segurança →'}
            </button>
          ) : (
            <div className="notice" role="status">
              <strong>Autenticação OIDC pendente de configuração</strong>
              <p>
                {identityIssue === 'PLACEHOLDER_OIDC_AUTHORITY'
                  ? `O valor atual de VITE_OIDC_AUTHORITY (${oidcAuthority}) é um placeholder de exemplo, não um provedor de identidade OIDC real.`
                  : identityIssue === 'INVALID_OIDC_URL'
                    ? `A URL configurada em VITE_OIDC_AUTHORITY (${oidcAuthority}) é inválida.`
                    : 'Defina VITE_OIDC_AUTHORITY, VITE_OIDC_CLIENT_ID, OIDC_ISSUER, OIDC_JWKS_URL e OIDC_AUDIENCE com seu provedor OIDC (Authorization Code + PKCE e MFA).'}
              </p>
              <p>
                Callback esperado no IdP: <code>{window.location.origin}/auth/callback</code>
              </p>
            </div>
          )}

          {previewAllowed && (
            <>
              <div className="login-divider">Ambiente de acompanhamento</div>
              <div className="login-preview-box">
                <strong>Preview de Interface (sem dados de clientes)</strong>
                <p>
                  Navegue e personalize todas as telas do painel com estados vazios reais enquanto
                  finalizamos a migração para Firebase Authentication e Cloud Firestore.
                </p>
                <button
                  type="button"
                  className={identityConfigured ? 'secondary-full' : 'primary'}
                  onClick={enterPreview}
                >
                  Acompanhar o painel em configuração
                </button>
              </div>
            </>
          )}

          {apiHealth.status === 'degraded' && (
            <div className="notice runtime-status" role="status">
              <strong>Backend integrado ativo · Infraestrutura externa pendente</strong>
              <ul className="runtime-checklist">
                <li>
                  <span className="state-ok">Ativa</span> API na mesma origem (<code>/health</code> e{' '}
                  <code>/v1</code>)
                </li>
                <li>
                  <span
                    className={
                      apiHealth.database?.connected && apiHealth.database?.schemaReady
                        ? 'state-ok'
                        : 'state-pending'
                    }
                  >
                    {apiHealth.database?.connected && apiHealth.database?.schemaReady
                      ? 'Conectado'
                      : 'Pendente'}
                  </span>{' '}
                  PostgreSQL: {apiHealth.database?.message ?? apiHealth.reason}
                </li>
                {apiHealth.worker && (
                  <li>
                    <span className="state-muted">{apiHealth.worker.provider}</span> Worker /
                    Provedor: {apiHealth.worker.message}
                  </li>
                )}
              </ul>
            </div>
          )}

          {apiHealth.status === 'unavailable' && (
            <div className="error" role="status">
              <strong>Backend / Banco de Dados indisponível</strong>
              <p>{apiHealth.reason}</p>
              <p>
                Configure <code>DATABASE_URL</code> e <code>MIGRATION_DATABASE_URL</code> apontando
                para um PostgreSQL acessível, execute <code>npm run db:migrate</code> e reinicie o
                servidor.
              </p>
            </div>
          )}

          {loginError && (
            <p role="alert" className="error">
              {loginError}
            </p>
          )}

          <small>
            {import.meta.env.VITE_LOCAL_EASY_LOGIN === 'LOCAL_MACHINE_ONLY'
              ? 'Homologação local: acesso de dispositivo, sem MFA real. Não publicar na internet.'
              : 'MFA obrigatório para administradores.'}
            <br />
            Seu acesso e sua licença são validados no servidor.
          </small>

          <button
            className="text-button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            Alternar tema {theme === 'dark' ? 'claro' : 'escuro'}
          </button>
        </section>
      </div>
    );

  const blocked = locations.error instanceof ApiError && locations.error.status === 402;
  const visibleItems = navigationItems.filter((item) =>
    !signed
      ? true
      : role === 'client_viewer'
        ? ['/', '/locations', '/results', '/reports', '/settings'].includes(item.path)
        : role === 'analyst'
          ? !['/team', '/billing', '/automation'].includes(item.path)
          : true,
  );

  const currentNavLabel =
    routeLocation.pathname === '/owner'
      ? 'Console proprietário'
      : routeLocation.pathname === '/geogrid'
        ? 'Nova auditoria · GeoGrid 5×5'
        : (navigationItems.find((i) => i.path === routeLocation.pathname)?.label ?? 'Workspace');

  return (
    <workspace.Provider
      value={{
        org,
        location,
        locations: locations.data ?? [],
        role,
        signed,
        previewMode: !signed && previewAllowed && previewMode,
        theme,
        apiHealth,
        setTheme,
        setLocation,
        notify: setNotice,
        act,
        exitPreview,
        refreshHealth,
      }}
    >
      <div className="shell">
        <div
          className={`sidebar-backdrop ${mobileNavOpen ? 'open' : ''}`}
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
        <aside className={mobileNavOpen ? 'open' : ''} aria-label="Navegação principal">
          <div className="sidebar-top">
            <div className="brand">
              <span className="mark">L↗</span>
              <strong>
                Local Rank
                <br />
                <span>Tracker</span>
              </strong>
            </div>
            <button
              type="button"
              className="ghost icon-btn mobile-close"
              aria-label="Fechar menu"
              onClick={() => setMobileNavOpen(false)}
            >
              <NavIcon name="close" />
            </button>
          </div>

          <div className="nav-groups">
            {NAV_GROUPS.map((group) => {
              const items = visibleItems.filter((item) => item.group === group);
              if (!items.length) return null;
              return (
                <div className="nav-group" key={group}>
                  <div className="nav-label">{group}</div>
                  <nav>
                    {items.map((item) => (
                      <NavLink key={item.path} to={item.path} end={item.path === '/'}>
                        <NavIcon name={item.icon} />
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </nav>
                </div>
              );
            })}

            {(me.data?.owner || (!signed && previewMode)) && (
              <div className="nav-group">
                <div className="nav-label">Plataforma</div>
                <nav>
                  <NavLink to="/owner">
                    <NavIcon name="owner" />
                    <span>Console proprietário</span>
                  </NavLink>
                </nav>
              </div>
            )}
          </div>

          <div className="sidebar-bottom">
            <Badge tone={signed ? 'ok' : 'warn'}>
              {signed ? 'Sessão OIDC verificada' : 'Preview isolado de UI'}
            </Badge>
            <small>
              {signed
                ? 'Histórico com rastreabilidade e RLS no PostgreSQL.'
                : 'Rotas /v1, MFA e RLS permanecem bloqueados no servidor.'}
            </small>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <div className="topbar-left">
              <button
                type="button"
                className="ghost icon-btn mobile-menu-btn"
                aria-label="Abrir menu"
                aria-expanded={mobileNavOpen}
                onClick={() => setMobileNavOpen(true)}
              >
                <NavIcon name="menu" />
              </button>

              <div className="topbar-context">
                <span className="topbar-section">{currentNavLabel}</span>
                <span className="topbar-divider" aria-hidden="true">
                  /
                </span>
                <select
                  className="org-select"
                  aria-label="Organização"
                  value={org}
                  disabled={!signed}
                  onChange={(e) => {
                    cache.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
                    setLocation('');
                    setOrg(e.target.value);
                  }}
                >
                  <option value="">
                    {signed ? 'Selecione organização' : 'Nenhuma organização conectada'}
                  </option>
                  {me.data?.organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="header-actions">
              {!signed && (
                <span className="preview-indicator">Preview de UI · Sem sessão</span>
              )}
              <button
                type="button"
                className="ghost icon-btn"
                title="Alternar tema"
                aria-label="Alternar tema"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                <NavIcon name={theme === 'dark' ? 'sun' : 'moon'} />
              </button>
              {signed ? (
                <>
                  <button type="button" className="ghost" onClick={() => void login(true)}>
                    Reautenticar
                  </button>
                  <button type="button" className="ghost" onClick={() => void logout()}>
                    Sair
                  </button>
                  <span className="avatar">LR</span>
                </>
              ) : (
                <button type="button" onClick={exitPreview}>
                  Voltar ao login
                </button>
              )}
            </div>
          </header>

          <main>
            {!signed && previewMode && (
              <div className="preview-banner">
                <div className="preview-banner-text">
                  <strong>Ambiente de Visualização de Desenvolvimento · Google AI Studio</strong>
                  <p>
                    Layout e telas interativas liberadas com estados vazios verdadeiros. Nenhuma
                    empresa, posição ou métrica é inventada; operações protegidas continuam
                    exigindo Neon PostgreSQL e OIDC.
                  </p>
                </div>
                <div className="preview-banner-actions">
                  <button type="button" onClick={() => navigate('/settings')}>
                    Status de conexão
                  </button>
                  <button type="button" onClick={exitPreview}>
                    Sair do preview
                  </button>
                </div>
              </div>
            )}

            {signed && me.error ? (
              <Empty title="Não foi possível acessar">{errorText(me.error)}</Empty>
            ) : signed && blocked && locationPath() !== '/owner' ? (
              <Panel title="Licença suspensa">
                <p>
                  O acesso operacional está bloqueado. Os dados e o histórico permanecem
                  preservados.
                </p>
                <button
                  onClick={() =>
                    void act(
                      () => api('/legal/data-requests', org, { requestType: 'ACCESS' }),
                      'Solicitação administrativa registrada.',
                    )
                  }
                >
                  Solicitar acesso administrativo aos dados
                </button>
              </Panel>
            ) : signed && locations.error ? (
              <Empty title="Acesso indisponível">{errorText(locations.error)}</Empty>
            ) : (
              <Routes key={org + ':' + location}>
                <Route path="/" element={<Overview />} />
                <Route path="/measure" element={<QuickMeasure />} />
                <Route path="/locations" element={<Locations />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/audits" element={<Audits />} />
                <Route path="/geogrid" element={<Audits />} />
                <Route path="/results" element={<Results />} />
                <Route path="/competitors" element={<Insights kind="competitors" />} />
                <Route path="/opportunities" element={<Insights kind="opportunities" />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/automation" element={<Automation />} />
                <Route path="/team" element={<Team />} />
                <Route path="/billing" element={<Billing />} />
                <Route path="/settings" element={<SettingsView />} />
                <Route path="/owner" element={<Owner />} />
                <Route path="*" element={<Empty title="Página não encontrada" />} />
              </Routes>
            )}
          </main>

          <footer>
            Medições dependem de fonte autorizada. Resultados variam por ponto, superfície e
            momento.
          </footer>
        </div>
      </div>

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </workspace.Provider>
  );
}

const locationPath = () => window.location.pathname;

export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

export function LocationPicker() {
  const w = useWorkspace();
  return (
    <select
      className="location-picker"
      aria-label="Unidade"
      value={w.location}
      onChange={(e) => w.setLocation(e.target.value)}
    >
      <option value="">
        {w.locations.length ? 'Selecione uma unidade' : 'Nenhuma unidade carregada'}
      </option>
      {w.locations.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name} · {l.city}
        </option>
      ))}
    </select>
  );
}

function Overview() {
  const w = useWorkspace(),
    navigate = useNavigate();

  const data = useQuery({
    queryKey: ['summary', w.org],
    queryFn: () =>
      api<{
        units: (Ranking['summary'] & {
          id: string;
          name: string;
          brand_id: string | null;
          brand: string | null;
        })[];
        providerEnabled: boolean;
        isDemo: boolean;
      }>('/organizations/' + w.org + '/summary', w.org),
    enabled: w.signed && !!w.org,
  });

  const [brand, setBrand] = useState('');
  const selected = (data.data?.units ?? []).filter((u) => !brand || u.brand_id === brand);
  const totals = selected.reduce(
    (acc, x) => ({
      top1: acc.top1 + x.top1,
      top3: acc.top3 + x.top3,
      verified: acc.verified + x.verified,
      samples: acc.samples + x.samples,
    }),
    { top1: 0, top3: 0, verified: 0, samples: 0 },
  );

  const checklist = buildSetupReadinessChecklist(
    w.apiHealth,
    identityConfigured,
    identityIssue,
  );

  return (
    <>
      <PageTitle
        eyebrow="VISÃO GERAL DA OPERAÇÃO"
        title="Inteligência para crescer localmente."
        description="Um panorama verificável das suas unidades e pesquisas comerciais."
        action={
          w.role !== 'client_viewer' && (
            <div className="actions" style={{ margin: 0 }}>
              <button type="button" onClick={() => navigate('/audits')}>
                GeoGrid 5×5
              </button>
              <button type="button" className="primary" onClick={() => navigate('/measure')}>
                Medir empresa
              </button>
            </div>
          )
        }
      />

      {data.data?.isDemo && <div className="notice">DEMO — dados sintéticos de homologação</div>}

      {!!data.data?.units.some((u) => u.brand_id) && (
        <label>
          Filtrar rede
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">Todas as unidades</option>
            {[
              ...new Map(
                data.data.units.filter((u) => u.brand_id).map((u) => [u.brand_id!, u.brand]),
              ).entries(),
            ].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="stats">
        {[
          ['Unidades', selected.length, 'Fichas cadastradas'],
          ['Posições verificadas', totals.verified, 'Amostras comerciais por ponto'],
          ['Top 1', totals.top1, 'Apenas observações verificadas'],
          ['Top 3', totals.top3, 'Inclui posições 1, 2 e 3'],
          ['Top 5', selected.reduce((n, x) => n + x.top5, 0), 'Posições de 1 a 5'],
          ['Top 10', selected.reduce((n, x) => n + x.top10, 0), 'Posições de 1 a 10'],
        ].map(([label, n, note]) => (
          <div className="stat panel" key={String(label)}>
            <span>{label}</span>
            <strong>{data.isLoading ? '…' : data.error ? '—' : n}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>

      <div className="two-columns">
        <Panel
          title="Sua carteira"
          subtitle="Fichas identificadas e organizadas por cidade."
          action={<Badge tone={w.locations.length ? 'ok' : 'neutral'}>{w.locations.length} unidades</Badge>}
        >
          {w.locations.length ? (
            w.locations
              .filter((l) => !brand || l.brand_id === brand)
              .map((l) => (
                <button
                  className="unit-row"
                  key={l.id}
                  onClick={() => {
                    w.setLocation(l.id);
                    navigate('/results');
                  }}
                >
                  <span className="unit-icon">{l.name.slice(0, 2).toUpperCase()}</span>
                  <span>
                    <strong>{l.name}</strong>
                    <small>{l.city}</small>
                  </span>
                  <Badge tone={l.identity_status === 'CONFIRMED' ? 'ok' : 'warn'}>
                    {l.identity_status === 'CONFIRMED'
                      ? 'Identidade confirmada'
                      : 'Confirmar identidade'}
                  </Badge>
                  <NavIcon name="arrowUpRight" size={15} />
                </button>
              ))
          ) : (
            <Empty
              title="Sua primeira unidade começa aqui"
              action={
                <button type="button" onClick={() => navigate('/locations')}>
                  Abrir Empresas e unidades
                </button>
              }
            >
              Cadastre a ficha pelo link do Google Maps após conectar seu banco e autenticação.
            </Empty>
          )}
        </Panel>

        <Panel
          title="Cobertura das medições"
          subtitle="Proporção de pesquisas comerciais com posição verificada."
        >
          {totals.samples ? (
            <div className="coverage">
              <strong>{Math.round((totals.verified / totals.samples) * 100)}%</strong>
              <p>
                {totals.verified} de {totals.samples} amostras comerciais verificadas.
              </p>
              <meter min={0} max={totals.samples} value={totals.verified} />
            </div>
          ) : (
            <Empty
              title="Ainda não há medições"
              action={
                <button type="button" onClick={() => navigate('/audits')}>
                  Preparar auditoria / GeoGrid
                </button>
              }
            >
              Os indicadores aparecem após uma auditoria concluída com uma fonte autorizada.
            </Empty>
          )}
        </Panel>
      </div>

      <div className="two-columns">
        <Panel
          title="Prontidão de Infraestrutura"
          subtitle="Estado real da API, banco PostgreSQL Neon, OIDC e provedor de coleta."
          action={
            <button type="button" onClick={() => navigate('/settings')}>
              Configurações
            </button>
          }
        >
          <ul className="checklist-list">
            {checklist.map((item) => (
              <li key={item.id} className="checklist-row">
                <div className="checklist-head">
                  <strong>{item.label}</strong>
                  <Badge
                    tone={
                      item.state === 'ready'
                        ? 'ok'
                        : item.state === 'checking'
                          ? 'neutral'
                          : 'warn'
                    }
                  >
                    {item.state === 'ready'
                      ? 'Ativo'
                      : item.state === 'checking'
                        ? 'Verificando'
                        : 'Pendente'}
                  </Badge>
                </div>
                <p className="muted">{item.detail}</p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Fluxo completo disponível"
          subtitle="Explore todas as telas da operação mantendo a segurança real do SaaS."
        >
          <div className="unit-row" style={{ cursor: 'default' }}>
            <span className="unit-icon">01</span>
            <span>
              <strong>Empresas, Termos & GeoGrid 5×5</strong>
              <small>Cadastre fichas, revise clusters e visualize grades de 25 pontos.</small>
            </span>
            <button type="button" onClick={() => navigate('/terms')}>
              Termos
            </button>
          </div>
          <div className="unit-row" style={{ cursor: 'default' }}>
            <span className="unit-icon">02</span>
            <span>
              <strong>Concorrentes, Resultados & Relatórios</strong>
              <small>Acompanhe posições por superfície e fluxo de aprovação de PDF.</small>
            </span>
            <button type="button" onClick={() => navigate('/reports')}>
              Relatórios
            </button>
          </div>
          <div className="unit-row" style={{ cursor: 'default' }}>
            <span className="unit-icon">03</span>
            <span>
              <strong>Automações, Equipe & Planos</strong>
              <small>Gerencie rotinas com teto de orçamento, papéis RLS e faturamento.</small>
            </span>
            <button type="button" onClick={() => navigate('/billing')}>
              Planos
            </button>
          </div>
        </Panel>
      </div>

      {w.signed && !data.data?.providerEnabled && (
        <div className="notice">
          <strong>Fonte de medição aguardando autorização</strong>
          <p>
            Você pode organizar fichas, revisar termos e preparar as grades. Nenhum ranking é
            simulado em produção.
          </p>
        </div>
      )}

      {data.error && <p className="error">{errorText(data.error)}</p>}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>,
);
