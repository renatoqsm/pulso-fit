'use client';
import { useCallback, useEffect, useState } from 'react';
import { Activity, LayoutDashboard, LogOut, Users, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Logo } from './logo';
import { WorkflowShell } from './workflow-shell';
import { AdminTools } from './admin-tools';
import { ActivityOverview } from './activity-overview';
import { clearOffline } from '@/lib/session-queue';
type Credential = {
  id: string;
  area: 'TRAINING' | 'NUTRITION';
  registration: string;
  region: string;
  status: string;
  professional?: { profile: { name: string } };
};
type Person = { id: string; profile: { name: string } };
type Link = {
  id: string;
  status: string;
  area: 'TRAINING' | 'NUTRITION';
  student: Person;
  professional: Person;
};
type Data = {
  user: {
    id: string;
    role: string;
    email: string;
    profile: { name: string; bio: string; specialty: string; contact: string };
  };
  credentials: Credential[];
  links: Link[];
  pending: Credential[];
};
const areaName = (a: string) => (a === 'TRAINING' ? 'Treinamento' : 'Nutrição');
const statusName = (s: string) =>
  ({ PENDING: 'Em análise', VERIFIED: 'Verificada', REJECTED: 'Não aprovada' })[s] ?? s;
export function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<Data>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState('');
  const [student, setStudent] = useState('');
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const open = () => {
      if (window.location.hash === '#vinculos') {
        const section = document.getElementById('vinculos') as HTMLDetailsElement | null;
        if (section) section.open = true;
      }
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, [data]);
  async function action(path: string, body: unknown) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setMessage(result.message);
      if (result.url) setInvite(result.url);
      if (path === 'auth/logout') {
        await clearOffline(data?.user.id ?? '');
        router.push('/entrar');
        router.refresh();
      } else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na conexão.');
    } finally {
      setBusy(false);
    }
  }
  async function viewStudent(link: Link) {
    setError('');
    try {
      const res = await fetch(`/api/students/${link.student.id}?area=${link.area}`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setStudent(
        `${result.student.profile.name} • Acesso autorizado em ${areaName(result.area)}. Registros dessa área serão disponibilizados nas próximas etapas.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na conexão.');
    }
  }
  if (!data)
    return (
      <main className="main">
        <Logo />
        <p role="status" style={{ marginTop: 30 }}>
          {error || 'Carregando seu espaço…'}
        </p>
        {error && <button onClick={load}>Tentar novamente</button>}
      </main>
    );
  const { user, credentials, links, pending } = data;
  const isPro = user.role === 'PROFESSIONAL';
  const isAdmin = user.role === 'ADMIN';
  const active = links.filter((l) => l.status === 'ACTIVE');
  return (
    <WorkflowShell title="Meu dia">
      <section className="welcome">
        <p className="eyebrow">Cada conexão é um novo começo</p>
        <h2>Olá, {user.profile.name.split(' ')[0]}.</h2>
        <p>
          {isAdmin
            ? 'Revise as habilitações profissionais com responsabilidade.'
            : isPro
              ? 'Prepare seu perfil, valide suas habilitações e conecte-se aos seus alunos.'
              : 'Seu treino, sua alimentação e os próximos passos do dia, em um só lugar.'}
        </p>
      </section>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      {isAdmin && <AdminTools />}
      <ActivityOverview />
      <details id="vinculos" className="dashboard-settings" open={isPro || isAdmin || undefined}>
        <summary>
          Perfil, vínculos e habilitações <span>Gerenciar conexões e dados do perfil</span>
        </summary>
        <section className="stats">
          <div className="card stat">
            <Users size={20} />
            <strong>{active.length}</strong>
            <p className="muted" style={{ margin: 0 }}>
              Vínculos ativos
            </p>
          </div>
          <div className="card stat">
            <ShieldCheck size={20} />
            <strong>
              {isAdmin
                ? pending.length
                : isPro
                  ? credentials.filter((c) => c.status === 'VERIFIED').length
                  : new Set(active.map((l) => l.area)).size}
            </strong>
            <p className="muted" style={{ margin: 0 }}>
              {isAdmin
                ? 'Registros em análise'
                : isPro
                  ? 'Habilitações verificadas'
                  : 'Áreas conectadas'}
            </p>
          </div>
          <div className="card stat">
            <Activity size={20} />
            <strong>
              {isAdmin
                ? 0
                : isPro
                  ? credentials.filter((c) => c.status === 'VERIFIED').length
                  : active.length
                    ? new Set(active.map((l) => l.area)).size
                    : 2}
            </strong>
            <p className="muted" style={{ margin: 0 }}>
              Áreas disponíveis
            </p>
          </div>
        </section>
        <div className="dashboard-grid">
          <div className="stack">
            <section className="card">
              <div className="row">
                <h2>{isPro ? 'Seus alunos' : 'Seus vínculos'}</h2>
                <Users size={20} />
              </div>
              {links.length === 0 ? (
                <p className="muted small">
                  {isPro
                    ? 'Ainda não há alunos vinculados. Gere um convite após validar sua habilitação.'
                    : 'Você ainda não tem vínculos. Pode começar pelo seu perfil e aceitar um convite quando quiser.'}
                </p>
              ) : (
                links.map((link) => (
                  <article className="link-card" key={link.id}>
                    <div className="row">
                      <h3>{isPro ? link.student.profile.name : link.professional.profile.name}</h3>
                      <span className="badge">
                        {link.status === 'ACTIVE' ? 'Ativo' : 'Encerrado'}
                      </span>
                    </div>
                    <p className="muted">
                      {areaName(link.area)} • Compartilhamento limitado a esta área.
                    </p>
                    {link.status === 'ACTIVE' && (
                      <div className="row wrap" style={{ justifyContent: 'flex-start' }}>
                        {isPro && (
                          <button className="secondary" onClick={() => viewStudent(link)}>
                            Ver aluno <ArrowUpRight size={15} />
                          </button>
                        )}
                        <button
                          className="danger"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                'Encerrar este vínculo e revogar o acesso compartilhado?',
                              )
                            )
                              void action('links/revoke', { id: link.id });
                          }}
                        >
                          Encerrar vínculo
                        </button>
                      </div>
                    )}
                  </article>
                ))
              )}
              {student && (
                <p className="message" role="status">
                  {student}
                </p>
              )}
            </section>
            {!isPro && !isAdmin && (
              <section className="card">
                <h2>Recebeu um convite?</h2>
                <p className="muted small">
                  Cole o código ou link do profissional. Você revisará a área antes de autorizar o
                  acesso.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = String(new FormData(e.currentTarget).get('token')).trim();
                    const token = input.split('/').filter(Boolean).pop();
                    if (token && /^[a-f0-9]{64}$/.test(token)) router.push(`/convite/${token}`);
                    else setError('Código de convite inválido.');
                  }}
                >
                  <div className="field">
                    <label htmlFor="token">Código ou link do convite</label>
                    <input id="token" name="token" required />
                  </div>
                  <button>
                    Revisar convite <ArrowUpRight size={16} />
                  </button>
                </form>
              </section>
            )}
            {isPro && (
              <section className="card">
                <h2>Suas habilitações</h2>
                <p className="muted small">
                  Cada área exige verificação própria. Informe CREF para treinamento ou CRN para
                  nutrição.
                </p>
                {credentials.map((c) => (
                  <article className="link-card" key={c.id}>
                    <div className="row">
                      <h3>{areaName(c.area)}</h3>
                      <span className="badge">{statusName(c.status)}</span>
                    </div>
                    <p className="muted">
                      {c.registration} • {c.region}
                    </p>
                    {c.status === 'VERIFIED' && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => action('invitations', { area: c.area })}
                      >
                        Gerar convite
                      </button>
                    )}
                  </article>
                ))}
                {(credentials.length < 2 || credentials.some((c) => c.status === 'REJECTED')) && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action('credentials', Object.fromEntries(new FormData(e.currentTarget)));
                    }}
                  >
                    <div className="field">
                      <label htmlFor="area">Área de atuação</label>
                      <select id="area" name="area">
                        {!credentials.some(
                          (c) => c.area === 'TRAINING' && c.status !== 'REJECTED',
                        ) && <option value="TRAINING">Treinamento • CREF</option>}
                        {!credentials.some(
                          (c) => c.area === 'NUTRITION' && c.status !== 'REJECTED',
                        ) && <option value="NUTRITION">Nutrição • CRN</option>}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="registration">Registro profissional</label>
                      <input
                        id="registration"
                        name="registration"
                        minLength={3}
                        maxLength={80}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="region">Região / conselho</label>
                      <input id="region" name="region" minLength={2} maxLength={40} required />
                    </div>
                    <button disabled={busy}>Enviar para verificação</button>
                  </form>
                )}
                {invite && (
                  <div className="message">
                    <p>
                      Convite para um aluno, válido por 7 dias. Copie e compartilhe diretamente com
                      ele:
                    </p>
                    <p className="code">{invite}</p>
                    <button
                      className="secondary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(invite);
                          setMessage('Convite copiado.');
                        } catch {
                          setError('Não foi possível copiar. Selecione o link manualmente.');
                        }
                      }}
                    >
                      Copiar link
                    </button>
                  </div>
                )}
              </section>
            )}
            {isAdmin && (
              <section className="card">
                <h2>Verificações pendentes</h2>
                <p className="muted small">
                  Confira a documentação e a situação no conselho antes de aprovar.
                </p>
                {pending.length === 0 && <p className="muted">Nenhum registro pendente.</p>}
                {pending.map((c) => (
                  <article className="link-card" key={c.id}>
                    <h3>{c.professional?.profile.name}</h3>
                    <p>
                      {areaName(c.area)} • {c.registration} • {c.region}
                    </p>
                    <div className="row wrap" style={{ justifyContent: 'flex-start' }}>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              'Confirma que verificou a identidade, os documentos e a situação do registro no conselho?',
                            )
                          )
                            void action('admin/review', {
                              id: c.id,
                              status: 'VERIFIED',
                              confirmed: true,
                            });
                        }}
                      >
                        Aprovar
                      </button>
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm('Confirma a rejeição após analisar este registro?'))
                            void action('admin/review', {
                              id: c.id,
                              status: 'REJECTED',
                              confirmed: true,
                            });
                        }}
                      >
                        Rejeitar
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            )}
          </div>
          <div className="stack">
            <section className="card">
              <h2>Seu perfil</h2>
              <p className="muted small">Mantenha suas informações atualizadas.</p>
              <form
                key={JSON.stringify(user.profile)}
                onSubmit={(e) => {
                  e.preventDefault();
                  void action('profile', Object.fromEntries(new FormData(e.currentTarget)));
                }}
              >
                <div className="field">
                  <label htmlFor="name">Nome</label>
                  <input
                    id="name"
                    name="name"
                    defaultValue={user.profile.name}
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </div>
                <div className="field">
                  <label htmlFor="bio">Apresentação</label>
                  <textarea
                    id="bio"
                    name="bio"
                    defaultValue={user.profile.bio}
                    rows={3}
                    maxLength={1000}
                  />
                </div>
                <div className="field">
                  <label htmlFor="specialty">{isPro ? 'Especialidade' : 'Interesses'}</label>
                  <input
                    id="specialty"
                    name="specialty"
                    defaultValue={user.profile.specialty}
                    maxLength={150}
                  />
                </div>
                <div className="field">
                  <label htmlFor="contact">Contato opcional</label>
                  <input
                    id="contact"
                    name="contact"
                    defaultValue={user.profile.contact}
                    maxLength={150}
                  />
                </div>
                <button disabled={busy}>Salvar perfil</button>
              </form>
            </section>
            <section className="card" style={{ background: '#edf3e3' }}>
              <span className="badge">SUA ROTINA</span>
              <h3 style={{ marginTop: 18 }}>Treinos e alimentação</h3>
              <p className="small muted">
                Treinos, execução de séries, evolução e alimentação estão disponíveis nos módulos
                habilitados. Os catálogos de exercícios e alimentos estão disponíveis; você também
                pode criar rótulos e receitas pessoais.
              </p>
            </section>
          </div>
        </div>
      </details>
    </WorkflowShell>
  );
}
