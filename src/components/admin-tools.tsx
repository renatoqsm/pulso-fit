'use client';
import { useEffect, useState } from 'react';
type Person = {
  id: string;
  email: string;
  role: string;
  disabledAt: string | null;
  profile: { name: string };
  adminPermissions: string[];
  credentials?: {
    id: string;
    area: string;
    registration: string;
    region: string;
    status: string;
  }[];
};
type Overview = {
  mfaEnabled: boolean;
  actorId: string;
  permissions: string[];
  users: number;
  activeUsers: number;
  professionals: number;
  pendingCredentials: number;
  pendingIntegrationEvents: number;
  deletionRequests: {
    id: string;
    status: string;
    createdAt: string;
    user: { id: string; email: string; profile: { name: string } };
  }[];
};
const labels: Record<string, string> = {
  VERIFY_CREDENTIALS: 'Verificar habilitações',
  MANAGE_USERS: 'Gerenciar usuários',
  MANAGE_CATALOG: 'Gerenciar catálogos',
  MANAGE_ADMIN_PERMISSIONS: 'Gerenciar administradores',
};
export function AdminTools() {
  const [overview, setOverview] = useState<Overview>();
  const [foods, setFoods] = useState<
    {
      id: string;
      name: string;
      source: string;
      sourceVersion: string | null;
      referenceUnit: string;
      active: boolean;
    }[]
  >([]);
  const [foodQuery, setFoodQuery] = useState('');
  const [foodPage, setFoodPage] = useState(1);
  const [foodTotal, setFoodTotal] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  async function load() {
    const res = await fetch('/api/admin/overview');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setOverview(data);
    if (data.permissions.includes('MANAGE_CATALOG')) {
      const res = await fetch(
        `/api/admin/foods?q=${encodeURIComponent(foodQuery)}&page=${foodPage}`,
      );
      const value = await res.json();
      if (!res.ok) throw new Error(value.error);
      setFoods(value.items);
      setFoodTotal(value.total);
    }
    if (data.permissions.includes('MANAGE_USERS')) {
      const users = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}&page=${page}`);
      const results = await users.json();
      if (!users.ok) throw new Error(results.error);
      setPeople(results.items);
      setTotal(results.total);
    }
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, [query, page, foodQuery, foodPage]);
  async function action(path: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch('/api/' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const value = await res.json();
      if (!res.ok) throw new Error(value.error);
      setMessage(value.message);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha na conexão.');
    } finally {
      setBusy(false);
    }
  }
  if (!overview) return <p role="status">{message || 'Carregando administração…'}</p>;
  return (
    <section className="card" style={{ marginBottom: 24 }}>
      <h2>Administração da plataforma</h2>
      {!overview.mfaEnabled && (
        <p className="message">
          Ative a autenticação em duas etapas em <a href="/conta">Conta</a> para administrar.
        </p>
      )}
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      <p className="muted small">
        {overview.users} contas • {overview.activeUsers} ativas • {overview.professionals}{' '}
        profissionais • {overview.pendingCredentials} habilitações pendentes •{' '}
        {overview.pendingIntegrationEvents} eventos aguardando futura integração.
      </p>
      <p className="muted small">
        Este painel não concede acesso a prontuários, sessões ou alimentação de usuários.
      </p>
      {overview.permissions.includes('MANAGE_CATALOG') && (
        <details style={{ marginBottom: 24 }}>
          <summary>Catálogo alimentar global ({foodTotal} alimentos)</summary>
          <p className="muted small">
            Importações oficiais são executadas pelo operador com o comando documentado no guia de
            operação, após revisão da fonte e licença. Alimentos privados dos usuários não aparecem
            aqui.
          </p>
          <form
            className="row wrap"
            onSubmit={(e) => {
              e.preventDefault();
              setFoodQuery(String(new FormData(e.currentTarget).get('foodQ')));
              setFoodPage(1);
            }}
          >
            <label style={{ flex: 1 }}>
              Buscar alimento global
              <input name="foodQ" maxLength={100} />
            </label>
            <button>Buscar alimentos</button>
          </form>
          {foods.map((food) => (
            <article className="link-card" key={food.id}>
              <div className="row wrap">
                <div>
                  <h3>{food.name}</h3>
                  <p className="muted small">
                    {food.source} • {food.sourceVersion ?? 'Versão não informada'} • 100{' '}
                    {food.referenceUnit} • {food.active ? 'Ativo' : 'Inativo'}
                  </p>
                </div>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void action(`admin/foods/${food.id}/status`, { active: !food.active })
                  }
                >
                  {food.active ? 'Desativar' : 'Reativar'}
                </button>
              </div>
            </article>
          ))}
          {!foods.length && (
            <p className="muted">
              Nenhum alimento global nesta consulta. Nenhum valor fictício foi adicionado.
            </p>
          )}
          <div className="row">
            <button
              className="secondary"
              disabled={foodPage === 1}
              onClick={() => setFoodPage((p) => p - 1)}
            >
              Alimentos anteriores
            </button>
            <span>Página {foodPage}</span>
            <button
              className="secondary"
              disabled={foodPage * 30 >= foodTotal}
              onClick={() => setFoodPage((p) => p + 1)}
            >
              Próximos alimentos
            </button>
          </div>
        </details>
      )}
      {overview.permissions.includes('MANAGE_USERS') && (
        <>
          <form
            className="row wrap"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(String(new FormData(e.currentTarget).get('q')));
              setPage(1);
            }}
          >
            <label style={{ flex: 1 }}>
              Buscar por nome/email
              <input name="q" maxLength={100} />
            </label>
            <button>Buscar contas</button>
          </form>
          {people.map((person) => (
            <article className="link-card" key={person.id}>
              <div className="row wrap">
                <div>
                  <h3>{person.profile.name}</h3>
                  <p className="muted small">
                    {person.email} •{' '}
                    {person.role === 'PROFESSIONAL'
                      ? 'Profissional'
                      : person.role === 'STUDENT'
                        ? 'Aluno'
                        : 'Administrador'}{' '}
                    • {person.disabledAt ? 'Desativada' : 'Ativa'}
                  </p>
                </div>
                <button
                  className="danger"
                  disabled={busy || person.id === overview.actorId}
                  onClick={() => {
                    if (
                      confirm(
                        person.disabledAt
                          ? 'Reativar a conta sem restaurar vínculos antigos?'
                          : 'Suspender esta conta, encerrar sessões e revogar os vínculos?',
                      )
                    )
                      void action(`admin/users/${person.id}/status`, {
                        active: !!person.disabledAt,
                        confirmed: true,
                      });
                  }}
                >
                  {person.disabledAt ? 'Reativar' : 'Suspender'}
                </button>
              </div>
              {overview.permissions.includes('MANAGE_ADMIN_PERMISSIONS') &&
                person.role === 'ADMIN' &&
                person.id !== overview.actorId && (
                  <details>
                    <summary>Permissões administrativas</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const permissions = new FormData(e.currentTarget).getAll('permissions');
                        if (
                          confirm('Atualizar estas permissões e encerrar sessões do administrador?')
                        )
                          void action(`admin/users/${person.id}/permissions`, {
                            permissions,
                            confirmed: true,
                          });
                      }}
                    >
                      {Object.entries(labels).map(([permission, label]) => (
                        <label className="consent" key={permission}>
                          <input
                            type="checkbox"
                            name="permissions"
                            value={permission}
                            defaultChecked={person.adminPermissions.includes(permission)}
                          />
                          {label}
                        </label>
                      ))}
                      <button disabled={busy}>Atualizar permissões</button>
                    </form>
                  </details>
                )}
              {person.credentials?.map((credential) => (
                <div key={credential.id} className="link-card">
                  <p className="small">
                    {credential.area === 'TRAINING' ? 'Treinamento' : 'Nutrição'} •{' '}
                    {credential.registration} • {credential.region} •{' '}
                    {credential.status === 'VERIFIED'
                      ? 'Verificada'
                      : credential.status === 'REJECTED'
                        ? 'Rejeitada'
                        : 'Em análise'}
                  </p>
                  <div className="row wrap" style={{ justifyContent: 'flex-start' }}>
                    <button
                      className="secondary"
                      disabled={busy || credential.status === 'VERIFIED'}
                      onClick={() => {
                        if (
                          confirm(
                            'Confirmar a verificação documental e a situação atual no conselho?',
                          )
                        )
                          void action(`admin/credentials/${credential.id}/status`, {
                            status: 'VERIFIED',
                            expectedStatus: credential.status,
                            confirmed: true,
                          });
                      }}
                    >
                      Verificar
                    </button>
                    <button
                      className="danger"
                      disabled={busy || credential.status === 'REJECTED'}
                      onClick={() => {
                        if (
                          confirm(
                            'Rejeitar esta habilitação e revogar somente os vínculos dessa área?',
                          )
                        )
                          void action(`admin/credentials/${credential.id}/status`, {
                            status: 'REJECTED',
                            expectedStatus: credential.status,
                            confirmed: true,
                          });
                      }}
                    >
                      Rejeitar / revogar
                    </button>
                  </div>
                </div>
              ))}
            </article>
          ))}
          <div className="row">
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <span>
              {total} contas • página {page}
            </span>
            <button
              className="secondary"
              disabled={page * 30 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
          <h3 style={{ marginTop: 24 }}>Solicitações de exclusão / retenção</h3>
          {overview.deletionRequests.map((request) => (
            <p className="small" key={request.id}>
              {request.user.profile.name} • {request.user.email} •{' '}
              {new Date(request.createdAt).toLocaleDateString('pt-BR')} • aguardando análise de
              retenção pelo responsável. Os dados não são apagados automaticamente.
            </p>
          ))}
          {!overview.deletionRequests.length && (
            <p className="muted small">Nenhuma solicitação pendente.</p>
          )}
        </>
      )}
    </section>
  );
}
