'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Logo } from './logo';
export function Invite({ token }: { token: string }) {
  const [data, setData] = useState<{
    professional: string;
    area: string;
    scope: string;
    expiresAt: string;
  }>();
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/invitations/${token}`);
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        setData(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha na conexão.');
      }
    }
    void load();
  }, [token]);
  return (
    <main className="main" style={{ maxWidth: 650 }}>
      <Logo />
      <section className="card" style={{ marginTop: 36 }}>
        <p className="eyebrow">Uma nova conexão</p>
        <h1 style={{ fontSize: 32 }}>Convite profissional</h1>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        {!data && !error && <p role="status">Carregando convite…</p>}
        {data && !done && (
          <>
            <p>
              <strong>{data.professional}</strong> convidou você para um vínculo de{' '}
              <strong>{data.area === 'TRAINING' ? 'treinamento' : 'nutrição'}</strong>.
            </p>
            <p className="muted">
              Você autoriza acesso ao seu histórico de{' '}
              {data.area === 'TRAINING' ? 'treinos' : 'alimentação'} nesta área. O convite não
              concede acesso à outra área. Você poderá encerrar o vínculo pelo painel.
            </p>
            <p className="small muted">
              Validade: {new Date(data.expiresAt).toLocaleDateString('pt-BR')}
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                try {
                  const res = await fetch('/api/links/accept', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, scope: data.scope, consent: true }),
                  });
                  const result = await res.json();
                  if (!res.ok) throw new Error(result.error);
                  setDone(true);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Falha na conexão.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="consent">
                <input type="checkbox" required /> Li e autorizo o compartilhamento nesta área com
                este profissional.
              </label>
              <button disabled={busy} style={{ marginTop: 20 }}>
                {busy ? 'Aguarde…' : 'Aceitar e vincular'}
              </button>
            </form>
          </>
        )}
        {done && (
          <p className="message" role="status">
            Vínculo ativado com seu consentimento.
          </p>
        )}
        <p style={{ marginTop: 24 }}>
          <Link className="button secondary" href="/painel">
            Ir para meu painel
          </Link>{' '}
          <Link href="/entrar" className="small">
            Entrar na conta
          </Link>
        </p>
      </section>
    </main>
  );
}
