'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { WorkflowShell } from './workflow-shell';
import { readApiResponse } from '@/lib/read-api-response';
import { deletePending, loadPending, savePending, type Pending } from '@/lib/session-queue';
type SetSpec = {
  id: string;
  position: number;
  repsMin: number | null;
  repsMax: number | null;
  targetKg: string | null;
  restSeconds: number;
  durationSeconds: number | null;
  kind: string;
  rpe: string | null;
  rir: number | null;
  cadence: string | null;
  unilateral: boolean;
  technique: string | null;
};
type SetLog = {
  id: string;
  prescriptionSetId: string;
  actualReps: number | null;
  actualKg: string | null;
  actualSeconds: number | null;
  rpe: string | null;
  rir: number | null;
  completedAt: string | null;
  prescription?: { position: number };
};
type Spec = {
  id: string;
  exerciseId: string;
  notes: string;
  groupKey: string | null;
  snapshot: { name: string; instructions: string };
  sets: SetSpec[];
};
type Exec = {
  id: string;
  prescriptionExerciseId: string;
  status: string;
  substituteId: string | null;
  substituteSnapshot: { name: string; instructions: string } | null;
  sets: SetLog[];
};
type Session = {
  id: string;
  viewer: { id: string; role: string };
  studentId: string;
  revision: number;
  status: string;
  startedAt: string;
  endedAt: string | null;
  feedback: string;
  discomfort: string;
  effort: number | null;
  difficulty: number | null;
  day: { name: string; notes: string; exercises: Spec[] };
  exercises: Exec[];
  version: { number: number; program: { name: string } };
  previous: (Exec & { prescription: { exerciseId: string }; session: { endedAt: string } })[];
  feedbackReplies: { id: string; text: string; createdAt: string }[];
};
type Input = {
  actualReps: number | null;
  actualKg: number | null;
  actualSeconds: number | null;
  rpe: number | null;
  rir: number | null;
};
export function SessionRunner({ id }: { id: string }) {
  const [data, setData] = useState<Session>();
  const [viewer, setViewer] = useState<{ id: string; role: string }>();
  const [inputs, setInputs] = useState<Record<string, Input>>({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(0);
  const [offlineConsent, setOfflineConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const queue = useRef<Pending[]>([]);
  const persistence = useRef(new Map<string, Promise<void>>());
  const revision = useRef(0);
  const current = useRef<Session | undefined>(undefined);
  const consent = useRef(false);
  const flushing = useRef(false);
  const lastSaved = useRef(new Map<string, string>());
  const initialRead = useRef<{ id: string; promise: Promise<Session> } | null>(null);
  async function read() {
    const res = await fetch(`/api/sessions/${id}`);
    const value = await readApiResponse(res);
    if (!res.ok) throw new Error(value.error);
    current.current = value;
    setData(value);
    if (!queue.current.length) revision.current = value.revision;
    return value as Session;
  }
  useEffect(() => {
    let active = true;
    async function start() {
      try {
        if (initialRead.current?.id !== id) initialRead.current = { id, promise: read() };
        const s = await initialRead.current.promise;
        if (!active) return;
        const actor = s.viewer;
        const stored =
          actor.id === s.studentId ? await loadPending(s.studentId, id).catch(() => []) : [];
        queue.current = stored;
        if (stored.length) {
          setOfflineConsent(true);
          consent.current = true;
          revision.current = Math.max(
            s.revision,
            ...stored.map((q) => Number(q.body.revision) + 1),
          );
          setPending(stored.length);
        }
        const values: Record<string, Input> = {};
        for (const exercise of s.day.exercises) {
          const execution = s.exercises.find((e) => e.prescriptionExerciseId === exercise.id);
          const last = s.previous.find(
            (e) =>
              (e.substituteId ?? e.prescription.exerciseId) ===
                (execution?.substituteId ?? exercise.exerciseId) && e.status !== 'SKIPPED',
          );
          for (const set of exercise.sets) {
            const existing = execution?.sets.find((v) => v.prescriptionSetId === set.id);
            const previous = last?.sets.find((v) => v.prescription?.position === set.position);
            const v = existing ?? previous;
            values[set.id] = {
              actualReps: v?.actualReps ?? null,
              actualKg: v?.actualKg == null ? null : Number(v.actualKg),
              actualSeconds: v?.actualSeconds ?? null,
              rpe: v?.rpe == null ? null : Number(v.rpe),
              rir: v?.rir ?? null,
            };
          }
        }
        for (const q of stored)
          if (q.path.endsWith('/sets'))
            values[String(q.body.prescriptionSetId)] = {
              actualReps: q.body.actualReps as number | null,
              actualKg: q.body.actualKg as number | null,
              actualSeconds: q.body.actualSeconds as number | null,
              rpe: q.body.rpe as number | null,
              rir: q.body.rir as number | null,
            };
        setInputs(values);
        for (const exercise of s.exercises)
          for (const set of exercise.sets)
            lastSaved.current.set(
              set.prescriptionSetId,
              JSON.stringify({
                actualReps: set.actualReps,
                actualKg: set.actualKg == null ? null : Number(set.actualKg),
                actualSeconds: set.actualSeconds,
                rpe: set.rpe == null ? null : Number(set.rpe),
                rir: set.rir,
                completed: !!set.completedAt,
              }),
            );
        setViewer(actor);
        void flush();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Falha ao carregar.');
      }
    }
    void start();
    const online = () => void flush();
    window.addEventListener('online', online);
    const prevent = (e: BeforeUnloadEvent) => {
      if (queue.current.length) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', prevent);
    return () => {
      active = false;
      window.removeEventListener('online', online);
      window.removeEventListener('beforeunload', prevent);
    };
  }, [id]);
  async function flush() {
    if (flushing.current || !current.current || !navigator.onLine || !queue.current.length) return;
    flushing.current = true;
    setBusy(true);
    let synced = false;
    let changed = false;
    try {
      while (queue.current.length) {
        const entry = queue.current[0];
        await persistence.current.get(entry.key);
        const res = await fetch(`/api/${entry.path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry.body),
        });
        const result = await readApiResponse(res);
        if (!res.ok) {
          if (res.status === 409) {
            const server = await read();
            const set = server.exercises
              .flatMap((e) => e.sets)
              .find((s) => s.prescriptionSetId === entry.body.prescriptionSetId);
            const same =
              entry.path.endsWith('/sets') &&
              set &&
              set.actualReps === (entry.body.actualReps ?? null) &&
              (set.actualKg == null
                ? entry.body.actualKg == null
                : entry.body.actualKg != null &&
                  Number(set.actualKg) === Number(entry.body.actualKg)) &&
              set.actualSeconds === (entry.body.actualSeconds ?? null) &&
              (set.rpe == null
                ? entry.body.rpe == null
                : entry.body.rpe != null && Number(set.rpe) === Number(entry.body.rpe)) &&
              set.rir === (entry.body.rir ?? null) &&
              !!set.completedAt === entry.body.completed;
            if (!same)
              throw new Error(
                'Há uma alteração em outra conexão. Confira os dados antes de reenviar as pendências.',
              );
          } else throw new Error(result.error);
        }
        if (res.ok && current.current) {
          const before = current.current;
          const next: Session = {
            ...before,
            ...(result.session ?? {}),
            revision: result.revision ?? before.revision,
          };
          if (result.set)
            next.exercises = before.exercises.map((e) =>
              e.prescriptionExerciseId === result.prescriptionExerciseId
                ? {
                    ...e,
                    status: 'EXECUTED',
                    sets: [
                      ...e.sets.filter((s) => s.prescriptionSetId !== result.set.prescriptionSetId),
                      result.set,
                    ],
                  }
                : e,
            );
          if (result.exercise)
            next.exercises = before.exercises.map((e) =>
              e.id === result.exercise.id ? { ...e, ...result.exercise } : e,
            );
          current.current = next;
          changed = true;
        }
        queue.current.shift();
        persistence.current.delete(entry.key);
        await deletePending(entry.key).catch(() => {});
        setPending(queue.current.length);
      }
      if (changed && current.current) setData(current.current);
      if (!queue.current.length && current.current) revision.current = current.current.revision;
      synced = true;
      setMessage(queue.current.length ? 'Sincronizando registros…' : 'Dados sincronizados.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Sem conexão. Pendências mantidas.');
    } finally {
      if (changed && current.current) setData(current.current);
      flushing.current = false;
      setBusy(false);
      if (synced && queue.current.length) void flush();
    }
  }
  async function enqueue(action: string, body: Record<string, unknown>) {
    if (!current.current) return;
    const order = revision.current++;
    const entry: Pending = {
      key: `${id}:${order}`,
      userId: current.current.studentId,
      sessionId: id,
      path: `sessions/${id}/${action}`,
      body: { ...body, revision: order },
      order,
    };
    queue.current.push(entry);
    setPending(queue.current.length);
    setMessage(navigator.onLine ? 'Sincronizando registros…' : 'Sem conexão. Pendências mantidas.');
    const saving = consent.current
      ? savePending(entry).catch(() => {
          setMessage(
            'Não foi possível salvar no dispositivo. Mantenha esta página aberta até sincronizar.',
          );
        })
      : Promise.resolve();
    persistence.current.set(entry.key, saving);
    await saving;
    void flush();
  }
  async function saveSet(set: SetSpec, completed: boolean) {
    const input = inputs[set.id];
    if (!input) return;
    if (completed && input.actualReps == null && input.actualSeconds == null) {
      setMessage('Informe repetições ou duração executada.');
      return;
    }
    const signature = JSON.stringify({ ...input, completed });
    if (lastSaved.current.get(set.id) === signature) return;
    lastSaved.current.set(set.id, signature);
    await enqueue('sets', { prescriptionSetId: set.id, ...input, completed });
  }
  if (!data)
    return (
      <WorkflowShell title="Sua sessão">
        <p className="message" role="status">
          {message || 'Carregando…'}
        </p>
      </WorkflowShell>
    );
  const writable =
    data.status === 'IN_PROGRESS' &&
    viewer?.id === data.studentId &&
    viewer?.role === 'STUDENT' &&
    !queue.current.some((q) => q.path.endsWith('/finish'));
  return (
    <WorkflowShell title={data.day.name}>
      <p className="muted">
        {data.version.program.name} •{' '}
        {writable ? 'Em andamento' : data.status === 'COMPLETED' ? 'Concluído' : 'Interrompido'}
      </p>
      <p>{data.day.notes}</p>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      {writable && (
        <div className="card" style={{ marginBottom: 24 }}>
          <label className="consent">
            <input
              type="checkbox"
              checked={offlineConsent}
              onChange={(e) => {
                setOfflineConsent(e.target.checked);
                consent.current = e.target.checked;
              }}
            />{' '}
            Guardar pendências offline neste dispositivo pessoal
          </label>
          <p className="muted small">
            As pendências ficam criptografadas até sincronizar. Sair da conta descarta as pendências
            locais. Sem essa opção, mantenha a página aberta quando estiver sem conexão.
          </p>
          {pending > 0 && (
            <div className="message queue-warning">
              <p>{pending} pendências de sincronização.</p>
              <button className="secondary" disabled={busy} onClick={() => void flush()}>
                Tentar sincronizar
              </button>
              <button
                className="danger"
                disabled={busy}
                style={{ marginLeft: 10 }}
                onClick={async () => {
                  for (const q of queue.current) await deletePending(q.key).catch(() => {});
                  queue.current = [];
                  lastSaved.current.clear();
                  setPending(0);
                  await read();
                  setMessage('Pendências descartadas; confira o histórico no servidor.');
                }}
              >
                Descartar pendências locais
              </button>
            </div>
          )}
        </div>
      )}
      {data.day.exercises.map((exercise) => {
        const execution = data.exercises.find((e) => e.prescriptionExerciseId === exercise.id);
        const last = data.previous.find(
          (e) =>
            (e.substituteId ?? e.prescription.exerciseId) ===
              (execution?.substituteId ?? exercise.exerciseId) && e.status !== 'SKIPPED',
        );
        return (
          <section className="card" key={exercise.id} style={{ marginBottom: 24 }}>
            <div className="row wrap">
              <h2>{execution?.substituteSnapshot?.name ?? exercise.snapshot.name}</h2>
              <span className="badge">
                {exercise.groupKey
                  ? `Grupo ${exercise.groupKey}`
                  : `${exercise.sets.length} séries`}
              </span>
            </div>
            <p>{exercise.notes}</p>
            <details>
              <summary>Instruções de execução</summary>
              <p style={{ whiteSpace: 'pre-wrap' }}>
                {execution?.substituteSnapshot?.instructions ?? exercise.snapshot.instructions}
              </p>
            </details>
            {last && (
              <p className="message small">
                Última execução concluída em{' '}
                {new Date(last.session.endedAt).toLocaleDateString('pt-BR')}:{' '}
                {last.sets
                  .map((s) => `${s.actualReps ?? '—'} rep. / ${s.actualKg ?? '—'} kg`)
                  .join(' • ')}
                . Valores anteriores são sugestões de preenchimento, não progressão prescrita.
              </p>
            )}
            {execution?.status === 'SKIPPED' ? (
              <p className="muted">Exercício ignorado nesta sessão.</p>
            ) : (
              exercise.sets.map((set) => {
                const logged = execution?.sets.find((v) => v.prescriptionSetId === set.id);
                const values = inputs[set.id] ?? {
                  actualReps: null,
                  actualKg: null,
                  actualSeconds: null,
                  rpe: null,
                  rir: null,
                };
                return (
                  <div
                    className={`link-card ${logged?.completedAt ? 'set-done' : ''}`}
                    key={set.id}
                  >
                    <h3>
                      Série {set.position + 1} •{' '}
                      {set.kind === 'WARMUP'
                        ? set.technique === 'Reconhecimento'
                          ? 'Reconhecimento'
                          : 'Aquecimento'
                        : set.kind === 'FAILURE'
                          ? 'Até a falha'
                          : set.kind === 'TIMED'
                            ? 'Temporizada'
                            : 'Série válida'}
                    </h3>
                    <p className="small muted">
                      Prescrição:{' '}
                      {set.durationSeconds
                        ? `${set.durationSeconds}s`
                        : set.repsMax
                          ? `${set.repsMin ?? set.repsMax}–${set.repsMax} rep.`
                          : set.repsMin
                            ? `${set.repsMin} rep.`
                            : 'repetições não especificadas'}
                      {set.targetKg != null ? ` • ${set.targetKg} kg` : ''} • descanso{' '}
                      {set.restSeconds}s{set.unilateral ? ' • unilateral' : ''}
                      {set.cadence ? ` • cadência ${set.cadence}` : ''}
                      {set.technique &&
                      !(set.kind === 'WARMUP' && set.technique === 'Reconhecimento')
                        ? ` • ${set.technique}`
                        : ''}
                    </p>
                    <div className="set-grid">
                      {(
                        [
                          'actualReps',
                          'actualKg',
                          ...(set.durationSeconds || set.kind === 'TIMED'
                            ? (['actualSeconds'] as const)
                            : []),
                          ...(set.rpe != null ? (['rpe'] as const) : []),
                          ...(set.rir != null ? (['rir'] as const) : []),
                        ] as const
                      ).map((key) => (
                        <label key={key}>
                          {
                            (
                              {
                                actualReps: 'Repetições feitas',
                                actualKg: 'Carga utilizada (kg)',
                                actualSeconds: 'Duração (s)',
                                rpe: 'RPE percebido',
                                rir: 'RIR percebido',
                              } as Record<string, string>
                            )[key]
                          }
                          <input
                            disabled={!writable || execution?.status === 'SKIPPED'}
                            type="number"
                            min="0"
                            max={key === 'rpe' ? 10 : key === 'rir' ? 20 : 10000}
                            step={key === 'actualKg' ? '0.001' : key === 'rpe' ? '0.1' : '1'}
                            value={values[key as keyof Input] ?? ''}
                            onChange={(e) =>
                              setInputs((v) => ({
                                ...v,
                                [set.id]: {
                                  ...values,
                                  [key]: e.target.value === '' ? null : Number(e.target.value),
                                },
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                    {writable && (
                      <button
                        className={logged?.completedAt ? 'secondary' : ''}
                        style={{ marginTop: 14 }}
                        onClick={() => void saveSet(set, true)}
                      >
                        {logged?.completedAt ? 'Salvar ajustes da série' : 'Concluir série'}
                      </button>
                    )}
                  </div>
                );
              })
            )}
            {writable && (
              <div className="row wrap" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
                <button
                  className="secondary"
                  onClick={() =>
                    void enqueue('exercise', {
                      prescriptionExerciseId: exercise.id,
                      status: execution?.status === 'SKIPPED' ? 'PLANNED' : 'SKIPPED',
                      notes: '',
                    })
                  }
                >
                  {execution?.status === 'SKIPPED' ? 'Retomar exercício' : 'Ignorar exercício'}
                </button>
              </div>
            )}
          </section>
        );
      })}
      {writable ? (
        <section className="card">
          <h2>Como foi seu treino?</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void enqueue('finish', {
                status: f.get('status'),
                effort: f.get('effort') ? Number(f.get('effort')) : null,
                difficulty: f.get('difficulty') ? Number(f.get('difficulty')) : null,
                rating: f.get('rating') ? Number(f.get('rating')) : null,
                feedback: f.get('feedback'),
                discomfort: f.get('discomfort'),
                technicalDifficulty: f.get('technicalDifficulty') === 'on',
              });
            }}
          >
            <div className="set-grid">
              {[
                ['effort', 'Esforço (1–10)', 10],
                ['difficulty', 'Dificuldade (1–10)', 10],
                ['rating', 'Avaliação (1–5)', 5],
              ].map(([key, label, max]) => (
                <label key={key}>
                  {label}
                  <input name={String(key)} type="number" min="1" max={Number(max)} />
                </label>
              ))}
            </div>
            <label style={{ marginTop: 16 }}>
              Feedback
              <textarea name="feedback" maxLength={3000} />
            </label>
            <label style={{ marginTop: 16 }}>
              Desconfortos (opcional)
              <textarea name="discomfort" maxLength={1000} />
            </label>
            <label className="consent" style={{ marginTop: 16 }}>
              <input type="checkbox" name="technicalDifficulty" /> Tive dificuldade técnica
            </label>
            <label>
              Encerramento
              <select name="status" aria-label="Encerramento">
                <option value="COMPLETED">Treino concluído</option>
                <option value="INTERRUPTED">Treino interrompido</option>
              </select>
            </label>
            <button style={{ marginTop: 20 }} disabled={busy}>
              Encerrar sessão
            </button>
            <p className="muted small">Os registros não geram diagnóstico médico.</p>
          </form>
        </section>
      ) : (
        <section className="card">
          <h2>Feedback registrado</h2>
          <p>{data.feedback || 'Nenhum comentário informado.'}</p>
          <p className="muted">{data.discomfort}</p>
          <Link className="button" href="/evolucao">
            Consultar evolução
          </Link>
        </section>
      )}
    </WorkflowShell>
  );
}
