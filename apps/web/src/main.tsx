import { useEffect, useState, createContext, useContext, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { identity, identityConfigured, setBearer, api, ApiError, errorText } from './session';
import type { Location, Me, Ranking } from './types';
import { Empty, Panel, Badge } from '../../../packages/ui/index';
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
  setLocation: (id: string) => void;
  notify: (s: string) => void;
  act: <T>(fn: () => Promise<T>, message?: string) => Promise<T | undefined>;
};
export const workspace = createContext<Workspace>(null!);
export const useWorkspace = () => useContext(workspace);
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 10000, refetchOnWindowFocus: true } },
});
const navigation = [
  ['/measure', '▶', 'Medir empresa'],
  ['/', '◫', 'Visão geral'],
  ['/locations', '▤', 'Empresas e unidades'],
  ['/terms', '⌕', 'Termos e clusters'],
  ['/audits', '◎', 'Nova auditoria'],
  ['/results', '↗', 'Resultados'],
  ['/competitors', '◈', 'Concorrentes'],
  ['/opportunities', '✧', 'Oportunidades'],
  ['/reports', '≡', 'Feedbacks e relatórios'],
  ['/automation', '◷', 'Automação'],
  ['/team', '♙', 'Equipe'],
  ['/billing', '▣', 'Faturamento'],
];
function App() {
  const [ready, setReady] = useState(false),
    [signed, setSigned] = useState(false),
    [loginError, setLoginError] = useState(''),
    [org, setOrg] = useState(''),
    [location, setLocation] = useState(''),
    [notice, setNotice] = useState(''),
    [theme, setTheme] = useState(localStorage.getItem('lrt-theme') ?? 'dark');
  const navigate = useNavigate(),
    cache = useQueryClient();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('lrt-theme', theme);
  }, [theme]);
  useEffect(() => {
    // Auto-login exclusively in the explicitly opted-in Windows local build.
    if (import.meta.env.VITE_LOCAL_EASY_LOGIN !== 'LOCAL_MACHINE_ONLY' ||
        window.location.hostname !== '127.0.0.1') return;
    if (!ready || signed || loginError || !identity ||
        window.location.pathname === '/auth/callback') return;
    if (sessionStorage.getItem('lrt-local-login-attempted') === '1') return;
    sessionStorage.setItem('lrt-local-login-attempted', '1');
    void identity.signinRedirect().catch((e) => setLoginError(errorText(e)));
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
          if (active) setSigned(true);
          if (locationPath() === '/auth/callback') navigate('/', { replace: true });
        }
      } catch (e) {
        setLoginError(errorText(e));
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
  async function login(recent = false) {
    try {
      await identity?.signinRedirect(recent ? { prompt: 'login', max_age: 0 } : {});
    } catch (e) {
      setLoginError(errorText(e));
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
        <h1>Local Rank Tracker</h1>
        <p>Restaurando sessão…</p>
      </div>
    );
  if (!signed)
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
            <div className="notice">
              <strong>Autenticação pendente de configuração</strong>
              <p>
                O administrador precisa conectar o provedor de identidade para liberar o acesso.
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
  return (
    <workspace.Provider
      value={{
        org,
        location,
        locations: locations.data ?? [],
        role,
        setLocation,
        notify: setNotice,
        act,
      }}
    >
      <div className="shell">
        <aside>
          <div className="brand">
            <span className="mark">L↗</span>
            <strong>
              Local Rank
              <br />
              <span>Tracker</span>
            </strong>
          </div>
          <div className="nav-label">WORKSPACE</div>
          <nav>
            {navigation
              .filter(([p]) =>
                role === 'client_viewer'
                  ? ['/', '/locations', '/results', '/reports'].includes(p)
                  : role === 'analyst'
                    ? !['/team', '/billing', '/automation'].includes(p)
                    : true,
              )
              .map(([p, icon, label]) => (
                <NavLink key={p} to={p} end={p === '/'}>
                  <span>{icon}</span>
                  {label}
                </NavLink>
              ))}
            {me.data?.owner && (
              <NavLink to="/owner">
                <span>♜</span>Console proprietário
              </NavLink>
            )}
          </nav>
          <div className="sidebar-bottom">
            <span className="status-dot" /> Histórico com rastreabilidade
            <small>Local Rank Tracker · v4.4 local</small>
          </div>
        </aside>
        <div className="main">
          <header>
            <select
              aria-label="Organização"
              value={org}
              onChange={(e) => {
                cache.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
                setLocation('');
                setOrg(e.target.value);
              }}
            >
              <option value="">Selecione organização</option>
              {me.data?.organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <div className="header-actions">
              <button
                title="Alternar tema"
                aria-label="Alternar tema"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? '☼' : '☾'}
              </button>
              <button onClick={() => void login(true)}>Reautenticar</button>
              <button onClick={() => void logout()}>Sair</button>
              <span className="avatar">LR</span>
            </div>
          </header>
          <main>
            {me.error ? (
              <Empty title="Não foi possível acessar">{errorText(me.error)}</Empty>
            ) : blocked && locationPath() !== '/owner' ? (
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
            ) : locations.error ? (
              <Empty title="Acesso indisponível">{errorText(locations.error)}</Empty>
            ) : (
              <Routes key={org + ':' + location}>
                <Route path="/" element={<Overview />} />
                <Route path="/measure" element={<QuickMeasure />} />
                <Route path="/locations" element={<Locations />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/audits" element={<Audits />} />
                <Route path="/results" element={<Results />} />
                <Route path="/competitors" element={<Insights kind="competitors" />} />
                <Route path="/opportunities" element={<Insights kind="opportunities" />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/automation" element={<Automation />} />
                <Route path="/team" element={<Team />} />
                <Route path="/billing" element={<Billing />} />
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
      <option value="">Selecione uma unidade</option>
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
    enabled: !!w.org,
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
  return (
    <>
      <PageTitle
        eyebrow="VISÃO GERAL DA OPERAÇÃO"
        title="Inteligência para crescer localmente."
        description="Um panorama verificável das suas unidades e pesquisas comerciais."
        action={
          w.role !== 'client_viewer' && (
            <button className="primary" onClick={() => navigate('/measure')}>
              ▶ Medir empresa
            </button>
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
          <div className="stat panel" key={label}>
            <span>{label}</span>
            <strong>{data.isLoading ? '…' : data.error ? '—' : n}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <div className="two-columns">
        <Panel title="Sua carteira" action={<Badge>{w.locations.length} unidades</Badge>}>
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
                  <Badge>
                    {l.identity_status === 'CONFIRMED'
                      ? 'Identidade confirmada'
                      : 'Confirmar identidade'}
                  </Badge>
                  <span>↗</span>
                </button>
              ))
          ) : (
            <Empty title="Sua primeira unidade começa aqui">
              Cadastre a ficha pelo link do Google Maps.
            </Empty>
          )}
        </Panel>
        <Panel title="Cobertura das medições">
          {totals.samples ? (
            <div className="coverage">
              <strong>{Math.round((totals.verified / totals.samples) * 100)}%</strong>
              <p>
                {totals.verified} de {totals.samples} amostras comerciais verificadas.
              </p>
              <meter min={0} max={totals.samples} value={totals.verified} />
            </div>
          ) : (
            <Empty title="Ainda não há medições">
              Os indicadores aparecem após uma auditoria concluída com uma fonte autorizada.
            </Empty>
          )}
        </Panel>
      </div>
      {!data.data?.providerEnabled && (
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
