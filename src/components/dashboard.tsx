'use client';
import { useEffect, useState } from 'react';
import { WorkflowShell } from './workflow-shell';
import { ActivityOverview } from './activity-overview';
import { readApiResponse } from '@/lib/read-api-response';
type Profile = { name: string; bio: string; specialty: string; contact: string };
export function Dashboard() {
  const [profile, setProfile] = useState<Profile>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch('/api/me')
      .then(async (r) => {
        const v = await readApiResponse(r);
        if (!r.ok) throw new Error(v.error);
        return v;
      })
      .then((v) => setProfile(v.profile))
      .catch((e) => setMessage(e.message));
  }, []);
  return (
    <WorkflowShell title="Meu dia">
      <section className="welcome">
        <p className="eyebrow">SEU TREINO, NO SEU RITMO</p>
        <h2>{profile ? `Olá, ${profile.name.split(' ')[0]}.` : 'Vamos treinar?'}</h2>
        <p>Monte suas fichas, escolha os dias e acompanhe sua evolução.</p>
      </section>
      <ActivityOverview />
      <details id="perfil" className="dashboard-settings">
        <summary>
          Meu perfil <span>Atualizar meus dados</span>
        </summary>
        {profile && (
          <form
            className="card"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage('');
              try {
                const response = await fetch('/api/profile', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
                });
                const result = await readApiResponse(response);
                if (!response.ok) throw new Error(result.error);
                setMessage(result.message);
              } catch (e) {
                setMessage(e instanceof Error ? e.message : 'Não foi possível salvar.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {(
              [
                ['name', 'Nome', 100],
                ['bio', 'Apresentação', 1000],
                ['specialty', 'Interesses', 150],
                ['contact', 'Contato opcional', 150],
              ] as const
            ).map(([key, label, max]) => (
              <label className="field" key={key}>
                {label}
                <input
                  name={key}
                  defaultValue={profile[key]}
                  maxLength={max}
                  required={key === 'name'}
                  minLength={key === 'name' ? 2 : undefined}
                />
              </label>
            ))}
            <button disabled={busy}>Salvar perfil</button>
          </form>
        )}
      </details>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
    </WorkflowShell>
  );
}
