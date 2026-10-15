'use client';
import { useEffect, useState } from 'react';
import { lowVolumeSets } from '@/lib/workout-presets';
import { WorkflowShell } from './workflow-shell';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import { ChevronDown, GripVertical, Plus, Search, ArrowLeft, Dumbbell } from 'lucide-react';
type SetInput = {
  repsMin: number | null;
  repsMax: number | null;
  targetKg: number | null;
  restSeconds: number;
  durationSeconds: number | null;
  kind: 'WARMUP' | 'WORKING' | 'TIMED' | 'FAILURE';
  cadence: string | null;
  rpe: number | null;
  rir: number | null;
  unilateral: boolean;
  technique: string | null;
};
type ExerciseInput = {
  exerciseId: string;
  notes: string;
  groupKey: string | null;
  sets: SetInput[];
};
type DayInput = {
  name: string;
  notes: string;
  suggestedDays: number[];
  exercises: ExerciseInput[];
};
type Draft = {
  objective: string;
  notes: string;
  validFrom: string | null;
  validUntil: string | null;
  days: DayInput[];
};
type Exercise = { id: string; name: string };
type Version = {
  id: string;
  number: number;
  draftRevision: number;
  publishedAt: string | null;
  program?: { name: string };
  days: (DayInput & {
    id: string;
    exercises: (ExerciseInput & { snapshot: { name: string }; id: string })[];
  })[];
} & Omit<Draft, 'days'>;
type Data = {
  own: { id: string; name: string; template: boolean; versions: Version[] }[];
  assigned: { version: Version }[];
  archived?: { version: Version }[];
  students: { id: string; profile: { name: string } }[];
  enabled: boolean;
  role: string;
};
const series = (): SetInput => ({
  repsMin: 6,
  repsMax: 8,
  targetKg: null,
  restSeconds: 60,
  durationSeconds: null,
  kind: 'WORKING',
  cadence: null,
  rpe: null,
  rir: null,
  unilateral: false,
  technique: null,
});
const fresh = (): Draft => ({
  objective: '',
  notes: '',
  validFrom: null,
  validUntil: null,
  days: [{ name: 'Treino A', notes: '', suggestedDays: [], exercises: [] }],
});
function draftFrom(v: Version): Draft {
  return {
    ...fresh(),
    objective: v.objective,
    notes: v.notes,
    validFrom: v.validFrom,
    validUntil: v.validUntil,
    days: v.days.map((d) => ({
      name: d.name,
      notes: d.notes,
      suggestedDays: d.suggestedDays,
      exercises: d.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        notes: e.notes,
        groupKey: e.groupKey,
        sets: e.sets.map((s) => ({
          ...series(),
          repsMin: s.repsMin,
          repsMax: s.repsMax,
          targetKg: s.targetKg == null ? null : Number(s.targetKg),
          restSeconds: s.restSeconds,
          durationSeconds: s.durationSeconds,
          kind: s.kind,
          cadence: s.cadence,
          rpe: s.rpe == null ? null : Number(s.rpe),
          rir: s.rir,
          unilateral: s.unilateral,
          technique: s.technique,
        })),
      })),
    })),
  };
}
export function WorkoutEditor() {
  const [data, setData] = useState<Data>();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [catalogItems, setCatalogItems] = useState<Exercise[]>([]);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPages, setCatalogPages] = useState(1);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [version, setVersion] = useState<Version>();
  const [draft, setDraft] = useState<Draft>(fresh());
  const [targets, setTargets] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [activeDay, setActiveDay] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [drag, setDrag] = useState<{ day: number; index: number }>();
  async function load() {
    try {
      const res = await fetch('/api/workouts');
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setData(result);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha na conexão.');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError('');
    setCatalogItems([]);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          '/api/exercises?page=' + catalogPage + '&q=' + encodeURIComponent(exerciseSearch.trim()),
          { signal: controller.signal, cache: 'no-store' },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? 'Não foi possível carregar os exercícios.');
        if (controller.signal.aborted) return;
        setCatalogItems(result.items);
        setCatalogPages(Math.max(1, result.pages));
        setCatalogTotal(result.total);
        setExercises((previous) => [
          ...previous.filter(
            (exercise) => !result.items.some((next: Exercise) => next.id === exercise.id),
          ),
          ...result.items,
        ]);
      } catch (error) {
        if (!controller.signal.aborted)
          setCatalogError(
            error instanceof Error ? error.message : 'Não foi possível carregar os exercícios.',
          );
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [exerciseSearch, catalogPage, catalogRetry]);
  useEffect(() => {
    const navigate = () => {
      if (
        ['#atuais', '#programas'].includes(window.location.hash) &&
        version &&
        (!dirty || window.confirm('Sair sem salvar as alterações?'))
      ) {
        setVersion(undefined);
        setDirty(false);
      }
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, [version, dirty]);
  function select(v: Version) {
    setVersion(v);
    setActiveDay(0);
    setExpanded({});
    setDirty(false);
    setDraft(draftFrom(v));
    setExerciseSearch('');
    setCatalogPage(1);
    setExercises((previous) => {
      const byId = new Map(previous.map((exercise) => [exercise.id, exercise]));
      for (const day of v.days)
        for (const exercise of day.exercises)
          if (!byId.has(exercise.exerciseId))
            byId.set(exercise.exerciseId, {
              id: exercise.exerciseId,
              name: exercise.snapshot.name,
            });
      return [...byId.values()];
    });
    setPreview(!!v.publishedAt);
    setTargets([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function editFichas(selected: Version) {
    const program = data?.own.find((p) => p.versions.some((v) => v.id === selected.id));
    if (!program || !data?.enabled) return;
    const draft = [...program.versions]
      .filter((v) => !v.publishedAt && v.number >= selected.number)
      .sort((a, b) => b.number - a.number)[0];
    if (draft) {
      select(draft);
      setMessage('Edite suas fichas e salve as alterações. Publique quando estiver pronto.');
    } else {
      const result = await action(`workouts/${selected.id}/revise`, {});
      if (result) setMessage('Ficha aberta para edição. O histórico anterior será preservado.');
    }
  }
  async function action(path: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch(`/api/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setMessage(result.message ?? 'Salvo.');
      await load();
      if (result.versionId) {
        const response = await fetch(`/api/workouts/version/${result.versionId}`);
        select(await response.json());
      } else if (version) {
        const response = await fetch(`/api/workouts/version/${version.id}`);
        if (response.ok) select(await response.json());
      }
      if (path.endsWith('/publish')) {
        setVersion(undefined);
        setDirty(false);
      }
      return result;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha na conexão.');
    } finally {
      setBusy(false);
    }
  }
  function mutate(fn: (value: Draft) => void) {
    setDirty(true);
    setDraft((v) => {
      const copy = structuredClone(v);
      fn(copy);
      return copy;
    });
  }
  function reorder(day: number, from: number, to: number) {
    mutate((v) => {
      const [e] = v.days[day].exercises.splice(from, 1);
      v.days[day].exercises.splice(to, 0, e);
    });
  }
  useUnsavedChanges(dirty);
  return (
    <WorkflowShell title="Seus treinos" activeHref={version ? '/treinos#programas' : undefined}>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      {!data ? (
        <p role="status">Carregando…</p>
      ) : (
        <>
          <p className="muted">
            {data.role === 'STUDENT'
              ? 'Crie treinos pessoais ou execute as fichas publicadas para você.'
              : 'Monte fichas, preserve versões e acompanhe seus alunos.'}
          </p>
          {data.enabled && !version && (
            <form
              className="card row wrap"
              style={{ marginBottom: 24 }}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action('workouts/create', {
                  name: f.get('name'),
                  template: f.get('template') === 'on',
                });
              }}
            >
              <div style={{ flex: 1 }}>
                <label htmlFor="new-program">Nome do programa</label>
                <input id="new-program" name="name" required minLength={2} maxLength={150} />
              </div>
              <label className="consent">
                <input type="checkbox" name="template" /> Modelo reutilizável
              </label>
              <button disabled={busy}>Criar programa</button>
            </form>
          )}
          {!version && (
            <div id="programas" className="exercise-grid program-library">
              {data.own.map((p) => (
                <article className="card" key={p.id}>
                  <h3>{p.name}</h3>
                  <span className="badge">
                    {p.template ? 'Modelo' : 'Programa pessoal/profissional'}
                  </span>
                  {data.enabled && p.versions.length > 0 && (
                    <button
                      className="full"
                      style={{ marginTop: 14 }}
                      disabled={busy}
                      aria-label={'Editar fichas de ' + p.name}
                      onClick={() =>
                        void editFichas([...p.versions].sort((a, b) => b.number - a.number)[0])
                      }
                    >
                      Editar fichas
                    </button>
                  )}
                  {p.versions.map((v) => (
                    <button
                      className="secondary full"
                      style={{ marginTop: 12 }}
                      key={v.id}
                      onClick={() => select(v)}
                    >
                      Versão {v.number} • {v.publishedAt ? 'Publicada' : 'Rascunho'}
                    </button>
                  ))}
                </article>
              ))}
            </div>
          )}
          {data.role === 'STUDENT' && !version && (
            <section id="atuais" style={{ marginTop: 30 }}>
              <h2>Fichas disponíveis</h2>
              {!data.assigned.length && (
                <p className="muted">Nenhuma ficha publicada disponível.</p>
              )}
              {data.assigned.map((a) => (
                <div className="card" key={a.version.id} style={{ marginBottom: 16 }}>
                  <h3>
                    {a.version.program?.name} • v{a.version.number}
                  </h3>
                  <p className="muted">{a.version.notes}</p>
                  {data.enabled &&
                    data.own.some((p) => p.versions.some((v) => v.id === a.version.id)) && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void editFichas(a.version)}
                      >
                        Editar minhas fichas
                      </button>
                    )}

                  {a.version.days.map((day) => (
                    <div className="row wrap" key={day.id} style={{ marginTop: 14 }}>
                      <span>
                        {day.name} • {day.exercises.length} exercícios
                      </span>
                      <button
                        disabled={busy}
                        onClick={async () => {
                          const result = await action('sessions/start', {
                            id: crypto.randomUUID(),
                            dayId: day.id,
                          });
                          if (result?.id) location.assign(`/sessoes/${result.id}`);
                        }}
                      >
                        Iniciar / recuperar sessão
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          )}
          {data.archived?.length ? (
            <section className="card" style={{ marginTop: 24 }}>
              <h2>Prescrições anteriores</h2>
              {data.archived.map((a) => (
                <button className="secondary" key={a.version.id} onClick={() => select(a.version)}>
                  {a.version.program?.name} • v{a.version.number}
                </button>
              ))}
            </section>
          ) : null}
          {version && (
            <section className="card workout-builder" style={{ marginTop: 24 }}>
              <div className="editor-context">
                <button
                  className="secondary"
                  onClick={() => {
                    if (!dirty || window.confirm('Sair sem salvar as alterações?')) {
                      setVersion(undefined);
                      setDirty(false);
                    }
                  }}
                >
                  <ArrowLeft size={16} /> Voltar aos planos
                </button>
                <span className="badge">
                  {version.publishedAt
                    ? 'Versão publicada'
                    : dirty
                      ? 'Alterações não salvas'
                      : 'Rascunho salvo'}
                </span>
              </div>
              <h2 className="editor-title">
                {data.own.find((p) => p.versions.some((v) => v.id === version.id))?.name ??
                  version.program?.name ??
                  'Seu plano de treino'}
              </h2>
              <div className="row wrap">
                <h2>
                  Versão {version.number} • {version.publishedAt ? 'Publicada' : 'Rascunho'}
                </h2>
                <div className="row wrap">
                  <button
                    className="secondary"
                    hidden={
                      !!version.publishedAt ||
                      !data.enabled ||
                      !data.own.some((p) => p.versions.some((v) => v.id === version.id))
                    }
                    onClick={() => setPreview(!preview)}
                  >
                    {preview ? 'Editar' : 'Visualizar como aluno'}
                  </button>
                  <button
                    className="secondary"
                    hidden={
                      !data.enabled ||
                      !data.own.some((p) => p.versions.some((v) => v.id === version.id))
                    }
                    disabled={busy}
                    onClick={() => action(`workouts/${version.id}/duplicate`, {})}
                  >
                    Duplicar programa
                  </button>
                  {version.publishedAt &&
                    data.enabled &&
                    data.own.some((p) => p.versions.some((v) => v.id === version.id)) && (
                      <button disabled={busy} onClick={() => void editFichas(version)}>
                        Editar fichas
                      </button>
                    )}
                </div>
              </div>
              {!version.publishedAt && (
                <p className="small muted">
                  Edite exercícios, séries e dias abaixo. Salve o rascunho ou publique para usar a
                  ficha atualizada nos próximos treinos.
                </p>
              )}
              {preview || version.publishedAt ? (
                <>
                  <p>{draft.objective}</p>
                  <p className="muted">{draft.notes}</p>
                  {draft.days.map((day, index) => (
                    <article className="link-card" key={index}>
                      <h3>{day.name}</h3>
                      <p>{day.notes}</p>
                      {day.exercises.map((e, i) => (
                        <p key={i}>
                          {exercises.find((v) => v.id === e.exerciseId)?.name ??
                            version.days[index]?.exercises[i]?.snapshot.name}{' '}
                          • {e.sets.length} séries •{' '}
                          {e.sets
                            .map((s) =>
                              s.durationSeconds
                                ? `${s.durationSeconds}s`
                                : s.repsMax
                                  ? `${s.repsMin ?? s.repsMax}–${s.repsMax} rep.`
                                  : s.repsMin
                                    ? `${s.repsMin} rep.`
                                    : s.kind === 'FAILURE'
                                      ? 'Até a falha'
                                      : 'Repetições livres',
                            )
                            .join(' / ')}
                          <br />
                          <span className="muted small">{e.notes}</span>
                        </p>
                      ))}
                    </article>
                  ))}
                </>
              ) : (
                <>
                  <details className="editor-settings">
                    <summary>Objetivo, orientações e validade</summary>
                    <div className="field">
                      <label htmlFor="objective">Objetivo</label>
                      <input
                        id="objective"
                        value={draft.objective}
                        maxLength={1000}
                        onChange={(e) =>
                          mutate((v) => {
                            v.objective = e.target.value;
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="notes">Orientações gerais</label>
                      <textarea
                        id="notes"
                        value={draft.notes}
                        maxLength={3000}
                        onChange={(e) =>
                          mutate((v) => {
                            v.notes = e.target.value;
                          })
                        }
                      />
                    </div>
                    <div className="dashboard-grid">
                      {(['validFrom', 'validUntil'] as const).map((key, i) => (
                        <div className="field" key={key}>
                          <label htmlFor={key}>{i ? 'Validade até' : 'Validade a partir de'}</label>
                          <input
                            id={key}
                            type="date"
                            value={draft[key]?.slice(0, 10) ?? ''}
                            onChange={(e) =>
                              mutate((v) => {
                                v[key] = e.target.value
                                  ? new Date(e.target.value + 'T00:00:00').toISOString()
                                  : null;
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </details>
                  <button
                    className="secondary"
                    style={{ marginTop: 20 }}
                    onClick={() => {
                      mutate((v) => {
                        v.days.push({
                          name: `Treino ${v.days.length + 1}`,
                          notes: '',
                          suggestedDays: [],
                          exercises: [],
                        });
                      });
                      setActiveDay(draft.days.length);
                    }}
                  >
                    Adicionar ficha
                  </button>
                  <div className="builder-tabs" role="tablist" aria-label="Fichas do plano">
                    {draft.days.map((day, i) => (
                      <button
                        key={i}
                        role="tab"
                        aria-selected={activeDay === i}
                        aria-controls={'workout-day-' + i}
                        id={'day-tab-' + i}
                        className={activeDay === i ? 'selected' : 'secondary'}
                        onClick={() => {
                          setActiveDay(i);
                          setExerciseSearch('');
                        }}
                      >
                        <Dumbbell size={16} />
                        {day.name}
                        <span>{day.exercises.length}</span>
                      </button>
                    ))}
                  </div>
                  {draft.days.map((day, di) =>
                    di !== activeDay ? null : (
                      <section
                        className="card workout-day"
                        role="tabpanel"
                        id={'workout-day-' + di}
                        aria-labelledby={'day-tab-' + di}
                        key={di}
                        style={{ marginTop: 20 }}
                      >
                        <div className="row wrap">
                          <input
                            aria-label="Nome da ficha"
                            value={day.name}
                            maxLength={100}
                            onChange={(e) =>
                              mutate((v) => {
                                v.days[di].name = e.target.value;
                              })
                            }
                          />
                          <button
                            className="secondary"
                            onClick={() =>
                              mutate((v) => {
                                v.days.push(structuredClone(v.days[di]));
                              })
                            }
                          >
                            Duplicar ficha
                          </button>
                          <button
                            className="danger"
                            disabled={draft.days.length === 1}
                            onClick={() => {
                              mutate((v) => {
                                v.days.splice(di, 1);
                              });
                              setActiveDay(Math.max(0, di - 1));
                            }}
                          >
                            Remover ficha
                          </button>
                        </div>
                        <details className="editor-settings">
                          <summary>Orientações e dias da semana</summary>
                          <textarea
                            aria-label="Orientações da ficha"
                            style={{ marginTop: 12 }}
                            value={day.notes}
                            maxLength={1000}
                            onChange={(e) =>
                              mutate((v) => {
                                v.days[di].notes = e.target.value;
                              })
                            }
                          />
                          <div className="row wrap" style={{ marginTop: 12 }}>
                            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(
                              (label, weekday) => (
                                <label className="consent" key={label}>
                                  <input
                                    type="checkbox"
                                    checked={day.suggestedDays.includes(weekday)}
                                    onChange={(e) =>
                                      mutate((v) => {
                                        v.days[di].suggestedDays = e.target.checked
                                          ? [...day.suggestedDays, weekday]
                                          : day.suggestedDays.filter((n) => n !== weekday);
                                      })
                                    }
                                  />
                                  {label}
                                </label>
                              ),
                            )}
                          </div>
                        </details>
                        <div className="exercise-picker">
                          <div className="catalog-heading">
                            <strong>Catálogo de exercícios</strong>
                            <span role="status">
                              {catalogLoading ? 'Carregando…' : catalogTotal + ' resultados'}
                            </span>
                          </div>
                          <label>
                            <Search size={16} /> Buscar exercício
                            <input
                              placeholder="Digite o nome do exercício…"
                              value={exerciseSearch}
                              onChange={(e) => {
                                setExerciseSearch(e.target.value);
                                setCatalogPage(1);
                              }}
                            />
                          </label>
                          {!catalogError && (
                            <ul
                              className="exercise-search-results"
                              aria-label="Exercícios encontrados"
                              aria-busy={catalogLoading}
                            >
                              {catalogLoading ? (
                                <li className="muted small">Buscando exercícios…</li>
                              ) : (
                                catalogItems.map((item) => (
                                  <li key={item.id}>
                                    <button
                                      className="exercise-search-result"
                                      aria-label={'Adicionar ' + item.name}
                                      onClick={() => {
                                        mutate((v) => {
                                          v.days[di].exercises.push({
                                            exerciseId: item.id,
                                            notes: '',
                                            groupKey: null,
                                            sets: lowVolumeSets(),
                                          });
                                        });
                                        setExpanded((old) => ({
                                          ...old,
                                          [di + ':' + day.exercises.length]: true,
                                        }));
                                      }}
                                    >
                                      <span>{item.name}</span>
                                      <span className="search-add">
                                        <Plus size={15} />{' '}
                                        {day.exercises.some((e) => e.exerciseId === item.id)
                                          ? 'Adicionar novamente'
                                          : 'Adicionar'}
                                      </span>
                                    </button>
                                  </li>
                                ))
                              )}
                            </ul>
                          )}
                          {catalogError && (
                            <div className="message error catalog-error" role="alert">
                              {catalogError}
                              <button
                                className="secondary"
                                onClick={() => setCatalogRetry((n) => n + 1)}
                              >
                                Tentar carregar novamente
                              </button>
                            </div>
                          )}
                          {!catalogLoading && !catalogError && !catalogItems.length && (
                            <p className="catalog-empty">
                              Nenhum exercício encontrado.
                              {exerciseSearch && (
                                <button
                                  className="secondary"
                                  onClick={() => {
                                    setExerciseSearch('');
                                    setCatalogPage(1);
                                  }}
                                >
                                  Limpar busca
                                </button>
                              )}
                            </p>
                          )}
                          {catalogPages > 1 && (
                            <nav className="catalog-pagination" aria-label="Páginas do catálogo">
                              <button
                                className="secondary"
                                disabled={catalogLoading || catalogPage === 1}
                                onClick={() => setCatalogPage((n) => n - 1)}
                              >
                                Anterior
                              </button>
                              <span>
                                Página {catalogPage} de {catalogPages}
                              </span>
                              <button
                                className="secondary"
                                disabled={catalogLoading || catalogPage === catalogPages}
                                onClick={() => setCatalogPage((n) => n + 1)}
                              >
                                Próxima
                              </button>
                            </nav>
                          )}
                        </div>
                        <div className="exercise-list-toolbar">
                          <span className="muted small">
                            {day.exercises.length} exercícios ·{' '}
                            {day.exercises.reduce((n, e) => n + e.sets.length, 0)} séries
                          </span>
                          <button
                            className="secondary"
                            onClick={() => {
                              const allOpen = day.exercises.every((_, i) => expanded[di + ':' + i]);
                              setExpanded((old) => ({
                                ...old,
                                ...Object.fromEntries(
                                  day.exercises.map((_, i) => [di + ':' + i, !allOpen]),
                                ),
                              }));
                            }}
                          >
                            {day.exercises.length > 0 &&
                            day.exercises.every((_, i) => expanded[di + ':' + i])
                              ? 'Recolher todos'
                              : 'Expandir todos'}
                          </button>
                        </div>
                        {!day.exercises.length && (
                          <div className="builder-empty">
                            <Dumbbell size={26} />
                            <h3>Vamos montar esta ficha?</h3>
                            <p>
                              Busque um exercício acima e ajuste as séries. Você pode duplicar e
                              reordenar depois.
                            </p>
                          </div>
                        )}
                        {day.exercises.map((exercise, ei) => (
                          <details
                            className="exercise-row"
                            open={!!expanded[di + ':' + ei]}
                            onToggle={(event) => {
                              const open = event.currentTarget.open;
                              setExpanded((old) =>
                                old[di + ':' + ei] === open
                                  ? old
                                  : { ...old, [di + ':' + ei]: open },
                              );
                            }}
                            key={ei}
                            draggable
                            onDragStart={() => setDrag({ day: di, index: ei })}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                              if (drag?.day === di) reorder(di, drag.index, ei);
                              setDrag(undefined);
                            }}
                          >
                            <summary className="exercise-summary">
                              <GripVertical size={17} />
                              <span className="exercise-number">
                                {String(ei + 1).padStart(2, '0')}
                              </span>
                              <strong>
                                {exercises.find((e) => e.id === exercise.exerciseId)?.name ??
                                  'Exercício'}
                              </strong>
                              <span className="exercise-prescription">
                                {exercise.sets.length} séries ·{' '}
                                {exercise.sets.filter((set) => set.kind !== 'WARMUP').length} de
                                trabalho
                              </span>
                              <ChevronDown size={18} />
                            </summary>
                            <div className="exercise-row-body">
                              <div className="row wrap">
                                <h3>
                                  {exercises.find((e) => e.id === exercise.exerciseId)?.name ??
                                    'Exercício'}
                                </h3>
                                <div className="row wrap">
                                  <button
                                    className="secondary"
                                    disabled={ei === 0}
                                    onClick={() => reorder(di, ei, ei - 1)}
                                    aria-label="Mover exercício para cima"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    className="secondary"
                                    disabled={ei === day.exercises.length - 1}
                                    onClick={() => reorder(di, ei, ei + 1)}
                                    aria-label="Mover exercício para baixo"
                                  >
                                    ↓
                                  </button>
                                  <button
                                    className="secondary"
                                    onClick={() =>
                                      mutate((v) => {
                                        v.days[di].exercises.splice(
                                          ei + 1,
                                          0,
                                          structuredClone(exercise),
                                        );
                                      })
                                    }
                                  >
                                    Duplicar
                                  </button>
                                  <button
                                    className="danger"
                                    onClick={() =>
                                      mutate((v) => {
                                        v.days[di].exercises.splice(ei, 1);
                                      })
                                    }
                                  >
                                    Remover
                                  </button>
                                </div>
                              </div>
                              <details className="editor-settings">
                                <summary>Observações e supersérie</summary>
                                <input
                                  aria-label="Observações do exercício"
                                  value={exercise.notes}
                                  maxLength={1000}
                                  onChange={(e) =>
                                    mutate((v) => {
                                      v.days[di].exercises[ei].notes = e.target.value;
                                    })
                                  }
                                />
                                <input
                                  aria-label="Grupo de supersérie, opcional"
                                  placeholder="Grupo de supersérie (opcional)"
                                  value={exercise.groupKey ?? ''}
                                  maxLength={60}
                                  style={{ marginTop: 10 }}
                                  onChange={(e) =>
                                    mutate((v) => {
                                      v.days[di].exercises[ei].groupKey = e.target.value || null;
                                    })
                                  }
                                />
                              </details>
                              <button
                                className="secondary copy-series"
                                onClick={() =>
                                  mutate((v) => {
                                    const target = v.days[di].exercises[ei];
                                    target.sets = target.sets.map((set) => ({
                                      ...structuredClone(target.sets[0]),
                                      kind: set.kind,
                                      technique: set.technique,
                                    }));
                                  })
                                }
                              >
                                Aplicar primeira série às demais
                              </button>
                              <p className="small muted low-volume-hint">
                                Novos exercícios: 1 aquecimento · 2 reconhecimento · 2 trabalho
                              </p>
                              {exercise.sets.map((set, si) => (
                                <div key={si} className="compact-set">
                                  <div className="compact-set-header">
                                    <strong>Série {si + 1}</strong>
                                    <select
                                      aria-label={'Tipo da série ' + (si + 1)}
                                      value={
                                        set.kind === 'WARMUP' && set.technique === 'Reconhecimento'
                                          ? 'RECOGNITION'
                                          : set.kind
                                      }
                                      onChange={(e) =>
                                        mutate((v) => {
                                          const target = v.days[di].exercises[ei].sets[si];
                                          target.kind =
                                            e.target.value === 'RECOGNITION'
                                              ? 'WARMUP'
                                              : (e.target.value as SetInput['kind']);
                                          if (e.target.value === 'RECOGNITION')
                                            target.technique = 'Reconhecimento';
                                          else if (target.technique === 'Reconhecimento')
                                            target.technique = null;
                                        })
                                      }
                                    >
                                      <option value="WARMUP">Aquecimento</option>
                                      <option value="RECOGNITION">Reconhecimento</option>
                                      <option value="WORKING">Trabalho</option>
                                      <option value="TIMED">Temporizada</option>
                                      <option value="FAILURE">Até a falha</option>
                                    </select>
                                    <button
                                      className="secondary compact-remove"
                                      aria-label={'Remover série ' + (si + 1)}
                                      disabled={exercise.sets.length === 1}
                                      onClick={() =>
                                        mutate((v) => {
                                          v.days[di].exercises[ei].sets.splice(si, 1);
                                        })
                                      }
                                    >
                                      ×
                                    </button>
                                  </div>
                                  <div className="set-grid compact-set-fields">
                                    {(
                                      [
                                        ['repsMin', 'Repetições mín.'],
                                        ['repsMax', 'Repetições máx.'],
                                        ['targetKg', 'Carga alvo (kg)'],
                                        ['restSeconds', 'Descanso (s)'],
                                      ] as const
                                    ).map(([key, label]) => (
                                      <label key={key}>
                                        {label}
                                        <input
                                          type="number"
                                          min="0"
                                          max={key === 'restSeconds' ? 3600 : 10000}
                                          step={key === 'targetKg' ? '0.001' : '1'}
                                          value={set[key] ?? ''}
                                          onChange={(e) =>
                                            mutate((v) => {
                                              const val =
                                                e.target.value === ''
                                                  ? null
                                                  : Number(e.target.value);
                                              v.days[di].exercises[ei].sets[si] = {
                                                ...set,
                                                [key]: key === 'restSeconds' ? (val ?? 0) : val,
                                              };
                                            })
                                          }
                                        />
                                      </label>
                                    ))}
                                  </div>
                                  <details style={{ marginTop: 12 }}>
                                    <summary>Parâmetros avançados</summary>
                                    <div className="set-grid" style={{ marginTop: 12 }}>
                                      {(['durationSeconds', 'rpe', 'rir'] as const).map((k) => (
                                        <label key={k}>
                                          {k === 'durationSeconds'
                                            ? 'Duração (s)'
                                            : k.toUpperCase()}
                                          <input
                                            type="number"
                                            min="0"
                                            max={k === 'rpe' ? 10 : k === 'rir' ? 20 : 10000}
                                            step={k === 'rpe' ? '0.1' : '1'}
                                            value={set[k] ?? ''}
                                            onChange={(e) =>
                                              mutate((v) => {
                                                v.days[di].exercises[ei].sets[si] = {
                                                  ...set,
                                                  [k]:
                                                    e.target.value === ''
                                                      ? null
                                                      : Number(e.target.value),
                                                };
                                              })
                                            }
                                          />
                                        </label>
                                      ))}
                                    </div>
                                    <div className="set-grid" style={{ marginTop: 12 }}>
                                      {(['cadence', 'technique'] as const).map((k) => (
                                        <label key={k}>
                                          {k === 'cadence'
                                            ? 'Cadência'
                                            : 'Técnica (drop-set, rest-pause etc.)'}
                                          <input
                                            value={set[k] ?? ''}
                                            maxLength={k === 'cadence' ? 80 : 120}
                                            onChange={(e) =>
                                              mutate((v) => {
                                                v.days[di].exercises[ei].sets[si] = {
                                                  ...set,
                                                  [k]: e.target.value || null,
                                                };
                                              })
                                            }
                                          />
                                        </label>
                                      ))}
                                      <label className="consent">
                                        <input
                                          type="checkbox"
                                          checked={set.unilateral}
                                          onChange={(e) =>
                                            mutate((v) => {
                                              v.days[di].exercises[ei].sets[si].unilateral =
                                                e.target.checked;
                                            })
                                          }
                                        />{' '}
                                        Unilateral
                                      </label>
                                    </div>
                                  </details>
                                </div>
                              ))}
                              <button
                                className="secondary"
                                onClick={() =>
                                  mutate((v) => {
                                    v.days[di].exercises[ei].sets.push(series());
                                  })
                                }
                              >
                                Adicionar série
                              </button>
                            </div>
                          </details>
                        ))}
                      </section>
                    ),
                  )}
                  <div className="card editor-savebar" style={{ marginTop: 24 }}>
                    {data.role === 'PROFESSIONAL' && (
                      <>
                        <h3>Atribuir aos alunos vinculados</h3>
                        {data.students.map((student) => (
                          <label className="consent" key={student.id}>
                            <input
                              type="checkbox"
                              checked={targets.includes(student.id)}
                              onChange={(e) =>
                                setTargets((v) =>
                                  e.target.checked
                                    ? [...v, student.id]
                                    : v.filter((id) => id !== student.id),
                                )
                              }
                            />
                            {student.profile.name}
                          </label>
                        ))}
                      </>
                    )}
                    <div
                      className="row wrap"
                      style={{ justifyContent: 'flex-start', marginTop: 14 }}
                    >
                      <button
                        disabled={busy}
                        onClick={() =>
                          action(`workouts/${version.id}/save`, {
                            revision: version.draftRevision,
                            data: draft,
                          })
                        }
                      >
                        Salvar rascunho
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={async () => {
                          const saved = await action(`workouts/${version.id}/save`, {
                            revision: version.draftRevision,
                            data: draft,
                          });
                          if (saved)
                            await action(`workouts/${version.id}/publish`, {
                              revision: saved.revision,
                              studentIds: targets,
                            });
                        }}
                      >
                        Salvar e publicar
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
    </WorkflowShell>
  );
}
