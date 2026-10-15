'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { WorkflowShell } from './workflow-shell';
type Entry = {
  id: string;
  date: string;
  durationSeconds: number;
  exercises: {
    exerciseId: string;
    snapshot: { name: string };
    volume: number;
    sets: { kg: string | null; reps: number | null; seconds: number | null }[];
  }[];
};
export function ProgressView() {
  const [role, setRole] = useState('');
  const [students, setStudents] = useState<{ id: string; profile: { name: string } }[]>([]);
  const [student, setStudent] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [sessions, setSessions] = useState<
    { id: string; status: string; startedAt: string; day: { name: string } }[]
  >([]);
  const [exercise, setExercise] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [planned, setPlanned] = useState<number | null>(null);
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/workouts');
        const value = await res.json();
        if (!res.ok) throw new Error(value.error);
        setRole(value.role);
        setStudents(value.students);
        const latest = value.assigned.filter(
          (
            a: { version: { programId: string; number: number } },
            _: number,
            all: { version: { programId: string; number: number } }[],
          ) =>
            !all.some(
              (b) =>
                b.version.programId === a.version.programId && b.version.number > a.version.number,
            ),
        );
        const suggested = latest
          .flatMap((a: { version: { days: { suggestedDays: number[] }[] } }) => a.version.days)
          .reduce((sum: number, d: { suggestedDays: number[] }) => sum + d.suggestedDays.length, 0);
        setPlanned(suggested || null);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Falha na conexão.');
      }
    }
    void load();
  }, []);
  useEffect(() => {
    if (!role || (role === 'PROFESSIONAL' && !student)) return;
    const controller = new AbortController();
    async function load() {
      try {
        const params = student ? '?studentId=' + student : '';
        const [res, history] = await Promise.all([
          fetch('/api/progress' + params, { signal: controller.signal }),
          fetch('/api/sessions' + params, { signal: controller.signal }),
        ]);
        const values = await res.json();
        const log = await history.json();
        if (!res.ok) throw new Error(values.error);
        if (!history.ok) throw new Error(log.error);
        setEntries(values);
        setSessions(log);
      } catch (e) {
        if (!controller.signal.aborted)
          setMessage(e instanceof Error ? e.message : 'Falha na conexão.');
      }
    }
    void load();
    return () => controller.abort();
  }, [role, student]);
  const localDate = (value: string) => {
    const d = new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const filtered = entries.filter(
    (e) => (!from || localDate(e.date) >= from) && (!to || localDate(e.date) <= to),
  );
  const names = [
    ...new Map(
      entries.flatMap((e) => e.exercises.map((x) => [x.exerciseId, x.snapshot.name] as const)),
    ).entries(),
  ];
  const points = filtered.map((e) => ({
    id: e.id,
    date: e.date,
    value: e.exercises
      .filter((x) => !exercise || x.exerciseId === exercise)
      .reduce((s, x) => s + x.volume, 0),
    sets: e.exercises.filter((x) => !exercise || x.exerciseId === exercise).flatMap((x) => x.sets),
  }));
  const max = Math.max(1, ...points.map((p) => p.value));
  const volume = points.reduce((s, p) => s + p.value, 0);
  const recordedLoads = points.flatMap((p) =>
    p.sets.filter((s) => s.kg != null).map((s) => Number(s.kg)),
  );
  const best = recordedLoads.length ? Math.max(...recordedLoads) : null;
  const lastWeek = entries.filter(
    (e) => new Date(e.date).getTime() >= Date.now() - 7 * 86400000,
  ).length;
  return (
    <WorkflowShell title="Evolução e histórico">
      <p className="muted small">
        Gráficos consideram até 1.000 sessões concluídas mais recentes; o histórico mostra até 100
        sessões. A exportação completa está disponível em Conta.
      </p>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      {role === 'PROFESSIONAL' && (
        <label className="card">
          Aluno vinculado
          <select
            value={student}
            onChange={(e) => {
              setStudent(e.target.value);
              setEntries([]);
              setSessions([]);
            }}
          >
            <option value="">Selecione um aluno autorizado</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.profile.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="stats" style={{ marginTop: 24 }}>
        <div className="card stat">
          <strong>{filtered.length}</strong>
          <p className="muted">Sessões concluídas no período</p>
        </div>
        <div className="card stat">
          <strong>{volume.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</strong>
          <p className="muted">Volume registrado (kg × rep.)</p>
        </div>
        <div className="card stat">
          <strong>{best == null ? '—' : best.toLocaleString('pt-BR')}</strong>
          <p className="muted">Maior carga registrada (kg)</p>
        </div>
      </div>
      <section className="card">
        <div className="set-grid">
          <label>
            Exercício
            <select value={exercise} onChange={(e) => setExercise(e.target.value)}>
              <option value="">Todos os exercícios</option>
              {names.map(([id, name]) => (
                <option value={id} key={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            De
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Até
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <p className="muted small" style={{ marginTop: 16 }}>
          Últimos 7 dias: {lastWeek} sessões concluídas.{' '}
          {planned == null
            ? 'Frequência planejada não definida.'
            : `Dias sugeridos nas fichas atuais: ${planned} por semana.`}{' '}
          Volume usa somente séries concluídas com repetições e cargas informadas.
        </p>
        <h2>Volume ao longo do tempo</h2>
        {points.length ? (
          <>
            <svg
              className="chart"
              viewBox="0 0 700 220"
              role="img"
              aria-label="Volume calculado das sessões registradas"
            >
              <line x1="40" y1="190" x2="670" y2="190" stroke="#c4d5c4" />
              <polyline
                fill="none"
                stroke="#206854"
                strokeWidth="3"
                points={points
                  .map(
                    (p, i) =>
                      `${40 + (points.length === 1 ? 300 : (i / (points.length - 1)) * 620)},${190 - (p.value / max) * 160}`,
                  )
                  .join(' ')}
              />
              {points.map((p, i) => (
                <circle
                  key={p.id}
                  cx={40 + (points.length === 1 ? 300 : (i / (points.length - 1)) * 620)}
                  cy={190 - (p.value / max) * 160}
                  r="5"
                  fill="#206854"
                >
                  <title>
                    {new Date(p.date).toLocaleDateString('pt-BR')}:{' '}
                    {p.value.toLocaleString('pt-BR')} kg × rep.
                  </title>
                </circle>
              ))}
            </svg>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'left' }}>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Séries executadas</th>
                    <th>Volume registrado</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.id}>
                      <td style={{ padding: '12px 0' }}>
                        {new Date(p.date).toLocaleDateString('pt-BR')}
                      </td>
                      <td>
                        {p.sets
                          .map((s) =>
                            s.seconds
                              ? `${s.seconds}s`
                              : `${s.reps ?? '—'} rep. × ${s.kg ?? '—'} kg`,
                          )
                          .join('; ')}
                      </td>
                      <td>{p.value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="muted">
            Ainda não há sessões concluídas neste período. Nenhuma progressão fictícia é exibida.
          </p>
        )}
      </section>
      <section className="card" style={{ marginTop: 24 }}>
        <h2>Sessões e feedbacks</h2>
        {sessions.map((s) => (
          <article key={s.id} className="link-card row wrap">
            <div>
              <h3>{s.day.name}</h3>
              <p className="muted small">
                {new Date(s.startedAt).toLocaleString('pt-BR')} •{' '}
                {s.status === 'COMPLETED'
                  ? 'Concluído'
                  : s.status === 'IN_PROGRESS'
                    ? 'Em andamento'
                    : 'Interrompido'}
              </p>
            </div>
            <Link className="button secondary" href={`/sessoes/${s.id}`}>
              {s.status === 'IN_PROGRESS' && role === 'STUDENT'
                ? 'Recuperar sessão'
                : 'Consultar / comentar'}
            </Link>
          </article>
        ))}
        {!sessions.length && <p className="muted">Nenhuma sessão disponível.</p>}
      </section>
    </WorkflowShell>
  );
}
