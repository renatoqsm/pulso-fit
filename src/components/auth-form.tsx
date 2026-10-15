'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
export function AuthForm({
  mode,
  professional = false,
}: {
  mode: 'login' | 'register';
  professional?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(event.currentTarget);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(f)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push('/painel');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na conexão.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <p className="eyebrow">Bem-vindo ao seu próximo passo</p>
      <h1>{mode === 'login' ? 'Bom ter você de volta.' : 'Vamos começar?'}</h1>
      <p className="muted">
        {mode === 'login'
          ? 'Entre para acompanhar suas conexões.'
          : 'Crie sua conta e construa sua rotina.'}
      </p>
      {mode === 'register' && (
        <>
          <div className="field">
            <label htmlFor="name">Seu nome</label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
            />
          </div>
          <div className="field">
            <label htmlFor="role">Como você vai usar o Pulso Fit?</label>
            <select id="role" name="role" defaultValue={professional ? 'PROFESSIONAL' : 'STUDENT'}>
              <option value="STUDENT">Sou aluno / uso por conta própria</option>
              <option value="PROFESSIONAL">Sou profissional</option>
            </select>
          </div>
        </>
      )}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          aria-describedby="password-help"
        />
        <p id="password-help" className="muted small">
          Use pelo menos 12 caracteres.
        </p>
      </div>
      {mode === 'login' && (
        <div className="field">
          <label htmlFor="code">Código do autenticador ou recuperação</label>
          <input id="code" name="code" maxLength={64} autoComplete="one-time-code" />
          <p className="muted small">Preencha se ativou a autenticação em duas etapas.</p>
        </div>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <button className="full" disabled={busy}>
        {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
      </button>
      <p className="small muted" style={{ marginTop: 22 }}>
        {mode === 'login' ? 'Ainda não tem conta?' : 'Já tem uma conta?'}{' '}
        <Link
          style={{ color: 'var(--green)', fontWeight: 700 }}
          href={mode === 'login' ? '/cadastro' : '/entrar'}
        >
          {mode === 'login' ? 'Cadastre-se' : 'Entre aqui'}
        </Link>
      </p>
    </form>
  );
}
