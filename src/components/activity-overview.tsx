'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
type Workspace = {
  modules: string[];
  recentSessions: { id: string; name: string; status: string; date: string; feedback: string }[];
  recentMeals: { id: string; mealName: string; date: string }[];
  workoutPrograms: number;
  nutritionPlans: number;
};
export function ActivityOverview() {
  const [data, setData] = useState<Workspace>();
  useEffect(() => {
    fetch('/api/workspace')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);
  if (!data?.modules) return null;
  return (
    <section className="card" style={{ marginBottom: 24 }}>
      <h2>Sua rotina</h2>
      <div className="row wrap" style={{ justifyContent: 'flex-start' }}>
        {data.modules.includes('TRAINING') && (
          <>
            <Link href="/treinos" className="button">
              Treinos
            </Link>
            <Link href="/exercicios" className="button secondary">
              Exercícios
            </Link>
            <Link href="/evolucao" className="button secondary">
              Evolução e feedbacks
            </Link>
          </>
        )}
        {data.modules.includes('NUTRITION') && (
          <Link href="/alimentacao" className="button">
            Alimentação e diário
          </Link>
        )}
      </div>
      {data.modules.includes('TRAINING') && (
        <>
          <p className="muted small" style={{ marginTop: 20 }}>
            {data.workoutPrograms} programas criados
          </p>
          {data.recentSessions.slice(0, 4).map((s) => (
            <div key={s.id} className="link-card row wrap">
              <div>
                <h3>{s.name}</h3>
                <p className="muted small">
                  {new Date(s.date).toLocaleDateString('pt-BR')} •{' '}
                  {s.status === 'IN_PROGRESS'
                    ? 'Em andamento'
                    : s.status === 'COMPLETED'
                      ? 'Concluído'
                      : 'Interrompido'}
                </p>
                {s.feedback && <p className="small">{s.feedback}</p>}
              </div>
              <Link href={`/sessoes/${s.id}`} className="button secondary">
                Abrir sessão
              </Link>
            </div>
          ))}
        </>
      )}
      {data.modules.includes('NUTRITION') && (
        <>
          <p className="muted small" style={{ marginTop: 20 }}>
            {data.nutritionPlans} planos/planejamentos criados
          </p>
          {data.recentMeals.slice(0, 4).map((m) => (
            <p key={m.id} className="small muted">
              {m.date} • {m.mealName}
            </p>
          ))}
        </>
      )}
      {!data.modules.length && (
        <p className="muted">
          Finalize a verificação das habilitações para acessar os módulos profissionais.
        </p>
      )}
    </section>
  );
}
