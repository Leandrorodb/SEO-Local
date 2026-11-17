import { Badge, Empty, Panel } from '../../../../packages/ui/index';
import { PageTitle, LocationPicker, useWorkspace } from '../main';
import { AgencyBranding, AlertSettings } from '../pages';
import { identityConfigured, identityIssue, oidcAuthority } from '../session';
import { buildSetupReadinessChecklist } from '../preview-mode';

export function SettingsView() {
  const w = useWorkspace();
  const checklist = buildSetupReadinessChecklist(
    w.apiHealth,
    identityConfigured,
    identityIssue,
  );

  return (
    <>
      <PageTitle
        eyebrow="PREFERÊNCIAS E INFRAESTRUTURA"
        title="Configurações"
        description="Aparência da interface, marca nos relatórios, regras de alerta e diagnóstico real de conexão."
      />

      <div className="two-columns">
        <Panel
          title="Conexão e Serviços Externos"
          subtitle="Diagnóstico ao vivo consultado em /health na mesma origem."
          action={
            <button type="button" onClick={() => void w.refreshHealth()}>
              Atualizar diagnóstico
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
          <div className="config-hints">
            <p className="muted">
              Callback OIDC esperado:{' '}
              <code className="mono">{window.location.origin}/auth/callback</code>
            </p>
            {oidcAuthority && (
              <p className="muted">
                VITE_OIDC_AUTHORITY atual: <code className="mono">{oidcAuthority}</code>
              </p>
            )}
            <p className="muted">
              Banco Neon: defina <code className="mono">DATABASE_URL</code> (role{' '}
              <code className="mono">lrt_app</code> sem BYPASSRLS) e{' '}
              <code className="mono">MIGRATION_DATABASE_URL</code> no ambiente do servidor, depois
              execute <code className="mono">npm run db:migrate</code>.
            </p>
          </div>
        </Panel>

        <Panel
          title="Aparência e Workspace"
          subtitle="Preferências locais de exibição para revisão do painel."
        >
          <div className="settings-stack">
            <div className="setting-item">
              <div>
                <strong>Tema da interface</strong>
                <p className="muted">
                  Alterne entre modo escuro de alto contraste e modo claro editorial.
                </p>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className={w.theme === 'dark' ? 'primary' : ''}
                  onClick={() => w.setTheme('dark')}
                >
                  Escuro
                </button>
                <button
                  type="button"
                  className={w.theme === 'light' ? 'primary' : ''}
                  onClick={() => w.setTheme('light')}
                >
                  Claro
                </button>
              </div>
            </div>

            <div className="setting-item">
              <div>
                <strong>Sessão e modo de visualização</strong>
                <p className="muted">
                  {w.signed
                    ? 'Sessão OIDC autenticada no servidor.'
                    : 'Preview isolado sem token de usuário e sem acesso a dados reais.'}
                </p>
              </div>
              {!w.signed && (
                <button type="button" onClick={() => w.exitPreview()}>
                  Voltar à tela de login
                </button>
              )}
            </div>
          </div>
        </Panel>
      </div>

      <div className="two-columns">
        <Panel
          title="Marca nos Relatórios"
          subtitle="Identidade visual aplicada apenas às minutas aprovadas."
        >
          {w.signed && w.role === 'org_admin' ? (
            <AgencyBranding />
          ) : (
            <Empty title="Requer organização autenticada como administrador">
              Conecte seu PostgreSQL e autentique com OIDC (papel <code>org_admin</code>) para
              salvar logotipo PNG e nome da agência em <code>/v1/branding</code>.
            </Empty>
          )}
        </Panel>

        <Panel
          title="Regras de Alerta da Unidade"
          subtitle="Gatilhos de queda de posição, novo líder e orçamento."
        >
          <LocationPicker />
          {w.signed && w.location && w.role === 'org_admin' ? (
            <AlertSettings />
          ) : (
            <Empty title="Nenhuma unidade autenticada selecionada">
              Selecione uma unidade em uma sessão OIDC ativa para configurar os gatilhos de alerta
              salvos em <code>/v1/locations/:id/alert-rules</code>.
            </Empty>
          )}
        </Panel>
      </div>
    </>
  );
}
