'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Dumbbell,
  Utensils,
  Clock3,
  Play,
  Plus,
  CalendarDays,
  TrendingUp,
} from 'lucide-react';
type Session = {
  id: string;
  name: string;
  status: string;
  date: string;
  endedAt: string | null;
  dayId: string;
  studentId: string;
};
type Workspace = {
  role: string;
  modules: string[];
  recentSessions: Session[];
  recentMeals: { id: string; mealName: string; date: string }[];
  workoutPrograms: number;
  nutritionPlans: number;
};
type Day = { id: string; name: string; suggestedDays: number[]; exercises: unknown[] };
type Workout = { assigned: { version: { id: string; program: { name: string }; days: Day[] } }[] };
type Meal = {
  id: string;
  name: string;
  time: string | null;
  items: { snapshot?: { name: string }; quantity: string; unit: string }[];
};
type Nutrition = { assigned: { version: { id: string; plan: { name: string }; meals: Meal[] } }[] };
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
async function read<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? 'Não foi possível carregar sua rotina.');
  return value;
}
export function ActivityOverview() {
  const [data, setData] = useState<Workspace>();
  const [workouts, setWorkouts] = useState<Workout>();
  const [nutrition, setNutrition] = useState<Nutrition>();
  const [consumed, setConsumed] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const dayKey = dateKey(clock);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError('');
      try {
        const workspace = await read<Workspace>('/api/workspace');
        if (cancelled) return;
        setData(workspace);
        if (workspace.role !== 'STUDENT') return;
        const results = await Promise.allSettled([
          workspace.modules.includes('TRAINING')
            ? read<Workout>('/api/workouts')
            : Promise.resolve(undefined),
          workspace.modules.includes('NUTRITION')
            ? read<Nutrition>('/api/nutrition')
            : Promise.resolve(undefined),
          workspace.modules.includes('NUTRITION')
            ? read<{ logs: { prescribedMealId: string | null; consumedAt: string | null }[] }>(
                '/api/meals?date=' + dayKey,
              )
            : Promise.resolve(undefined),
        ]);
        if (cancelled) return;
        const [training, food, diary] = results;
        if (training.status === 'fulfilled') setWorkouts(training.value);
        if (food.status === 'fulfilled') setNutrition(food.value);
        if (diary.status === 'fulfilled')
          setConsumed(
            diary.value?.logs
              .filter((l) => l.consumedAt && l.prescribedMealId)
              .map((l) => l.prescribedMealId!) ?? [],
          );
        if (results.some((r) => r.status === 'rejected'))
          setError('Parte da sua rotina não carregou. Tente atualizar.');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar.');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reload, dayKey]);
  async function start(day: Day) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: crypto.randomUUID(), dayId: day.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.assign('/sessoes/' + result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível iniciar.');
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="card" aria-busy={!error}>
        <p role="status">{error || 'Preparando sua rotina…'}</p>
        {error && <button onClick={() => setReload((n) => n + 1)}>Tentar novamente</button>}
      </section>
    );
  if (data.role === 'ADMIN') return null;
  if (data.role !== 'STUDENT')
    return (
      <section className="card professional-shortcuts">
        <h2>Seu trabalho, mais simples</h2>
        <p className="muted">Prepare os próximos passos dos seus alunos.</p>
        <div className="row wrap">
          {data.modules.includes('TRAINING') && (
            <Link href="/treinos#programas" className="button">
              <Dumbbell size={18} /> Criar ou revisar treinos
            </Link>
          )}
          {data.modules.includes('NUTRITION') && (
            <Link href="/alimentacao#plans" className="button secondary">
              <Utensils size={18} /> Criar ou revisar planos alimentares
            </Link>
          )}
        </div>
      </section>
    );
  const activeSession = data.recentSessions.find((s) => s.status === 'IN_PROGRESS');
  const days =
    workouts?.assigned.flatMap((a) =>
      a.version.days.map((day) => ({ ...day, program: a.version.program?.name })),
    ) ?? [];
  const scheduled = days.filter((d) => d.suggestedDays.includes(clock.getDay()));
  const flexible = days.filter((d) => !d.suggestedDays.length);
  const completed = new Set(
    data.recentSessions
      .filter(
        (s) => s.status === 'COMPLETED' && s.endedAt && dateKey(new Date(s.endedAt)) === dayKey,
      )
      .map((s) => s.dayId),
  );
  const todays = (scheduled.length ? scheduled : flexible).sort(
    (a, b) => Number(completed.has(a.id)) - Number(completed.has(b.id)),
  );
  const completedToday = !!todays[0] && completed.has(todays[0].id);
  const meals =
    nutrition?.assigned
      .flatMap((a) => a.version.meals.map((meal) => ({ ...meal, plan: a.version.plan?.name })))
      .filter((m) => !consumed.includes(m.id)) ?? [];
  const minutes = clock.getHours() * 60 + clock.getMinutes();
  const timed = meals.filter((m) => m.time).sort((a, b) => a.time!.localeCompare(b.time!));
  const next = timed.find(
    (m) => Number(m.time!.slice(0, 2)) * 60 + Number(m.time!.slice(3, 5)) >= minutes,
  );
  const pending = next ?? timed[0] ?? meals[0];
  return (
    <section className="daily-overview" aria-label="Sua rotina de hoje">
      <div className="section-heading">
        <div>
          <p className="eyebrow">FOCO NO QUE IMPORTA</p>
          <h2>Sua rotina de hoje</h2>
        </div>
        <span className="muted small">
          <CalendarDays size={15} />{' '}
          {clock.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>
      {error && (
        <p className="message error" role="alert">
          {error}{' '}
          <button className="secondary" onClick={() => setReload((n) => n + 1)}>
            Atualizar
          </button>
        </p>
      )}
      <div className="today-grid">
        {data.modules.includes('TRAINING') && (
          <article className="today-card training-today">
            <div className="row">
              <span className="card-icon">
                <Dumbbell size={22} />
              </span>
              <span className="badge">
                {activeSession
                  ? 'Em andamento'
                  : completedToday
                    ? 'Concluído hoje'
                    : scheduled.length
                      ? 'Programado para hoje'
                      : todays.length
                        ? 'Horário livre'
                        : 'Seu movimento'}
              </span>
            </div>
            <p className="eyebrow">{activeSession ? 'CONTINUE DE ONDE PAROU' : 'TREINO DE HOJE'}</p>
            <h3>
              {activeSession?.name ??
                todays[0]?.name ??
                (days.length ? 'Dia sem treino programado' : 'Seu primeiro treino começa aqui')}
            </h3>
            <p className="muted">
              {activeSession
                ? 'Sua sessão está salva. Retome as séries no seu ritmo.'
                : todays[0]
                  ? `${todays[0].program} · ${todays[0].exercises.length} exercícios${scheduled.length ? '' : ' · Sem dia fixo'}`
                  : days.length
                    ? 'Confira suas fichas e escolha quando treinar.'
                    : 'Monte uma ficha pessoal ou acompanhe um plano do seu treinador.'}
            </p>
            {activeSession ? (
              <Link href={'/sessoes/' + activeSession.id} className="button">
                <Play size={17} /> Continuar treino
              </Link>
            ) : todays[0] ? (
              <button disabled={busy} onClick={() => start(todays[0])}>
                <Play size={17} />{' '}
                {busy ? 'Preparando…' : completedToday ? 'Treinar novamente' : 'Começar treino'}
              </button>
            ) : (
              <Link href="/treinos#programas" className="button">
                <Plus size={17} /> {days.length ? 'Ver meus treinos' : 'Montar meu treino'}
              </Link>
            )}
            {todays.length > 1 && (
              <p className="small">
                <Link href="/treinos#atuais">
                  Mais {todays.length - 1} ficha(s) disponível(is) <ArrowUpRight size={14} />
                </Link>
              </p>
            )}
          </article>
        )}
        {data.modules.includes('NUTRITION') && (
          <article className="today-card nutrition-today">
            <div className="row">
              <span className="card-icon">
                <Utensils size={22} />
              </span>
              <span className="badge">
                <Clock3 size={13} /> {pending?.time ?? 'No seu ritmo'}
              </span>
            </div>
            <p className="eyebrow">
              {pending && !next && pending.time
                ? 'REFEIÇÃO PENDENTE DE REGISTRO'
                : 'PRÓXIMA ALIMENTAÇÃO'}
            </p>
            <h3>{pending?.name ?? 'Organize suas refeições'}</h3>
            <p className="muted">
              {pending
                ? pending.items
                    .map((i) => i.snapshot?.name)
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(' · ') || pending.plan
                : nutrition?.assigned.length
                  ? 'Sem próximas refeições pendentes neste plano. Consulte seu diário.'
                  : 'Crie um planejamento com alimentos e horários que façam sentido para você.'}
            </p>
            <Link
              href={pending ? '/alimentacao#diary' : '/alimentacao#plans'}
              className="button secondary"
            >
              {pending ? 'Registrar refeição' : 'Ver planos alimentares'}
              <ArrowUpRight size={17} />
            </Link>
          </article>
        )}
      </div>
      <div className="routine-shortcuts">
        {data.modules.includes('TRAINING') && (
          <Link href="/treinos#programas">
            <Dumbbell size={19} />
            <span>
              <strong>Planos de treino</strong>
              <small>{data.workoutPrograms} criado(s) · montar e revisar</small>
            </span>
            <ArrowUpRight size={17} />
          </Link>
        )}
        {data.modules.includes('NUTRITION') && (
          <Link href="/alimentacao#plans">
            <Utensils size={19} />
            <span>
              <strong>Planos alimentares</strong>
              <small>{data.nutritionPlans} criado(s) · organizar refeições</small>
            </span>
            <ArrowUpRight size={17} />
          </Link>
        )}
        {data.modules.includes('TRAINING') && (
          <Link href="/evolucao">
            <TrendingUp size={19} />
            <span>
              <strong>Minha evolução</strong>
              <small>Histórico e progresso</small>
            </span>
            <ArrowUpRight size={17} />
          </Link>
        )}
      </div>
      {!!data.recentSessions.length && (
        <details className="recent-activity">
          <summary>Atividades recentes</summary>
          {data.recentSessions.slice(0, 4).map((s) => (
            <Link key={s.id} href={'/sessoes/' + s.id} className="activity-row">
              <span>
                {s.name}
                <small>{new Date(s.date).toLocaleDateString('pt-BR')}</small>
              </span>
              <span className="badge">
                {s.status === 'IN_PROGRESS'
                  ? 'Em andamento'
                  : s.status === 'COMPLETED'
                    ? 'Concluído'
                    : 'Interrompido'}
              </span>
            </Link>
          ))}
        </details>
      )}
    </section>
  );
}
