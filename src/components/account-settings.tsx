'use client';
import { useEffect, useState } from 'react';
import { WorkflowShell } from './workflow-shell';
import { clearOffline } from '@/lib/session-queue';
export function AccountSettings() {
  const [user, setUser] = useState<{
    mfaEnabled: boolean;
    id: string;
    email: string;
    profile: { name: string; photoId: string | null };
  }>();
  const [message, setMessage] = useState('');
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; uri: string }>();
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then(setUser)
      .catch(() => setMessage('Falha ao carregar sua conta.'));
  }, []);
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
      if (value.secret) setMfaSetup({ secret: value.secret, uri: value.uri });
      if (typeof value.mfaEnabled === 'boolean') {
        setUser((u) => (u ? { ...u, mfaEnabled: value.mfaEnabled } : u));
        setMfaSetup(undefined);
      }
      if (value.recoveryCodes) setRecoveryCodes(value.recoveryCodes);
      else if (path === 'account/mfa/disable') setRecoveryCodes([]);
      if (path === 'account/close') {
        await clearOffline(user?.id ?? '');
        location.assign('/entrar');
      }
      if (value.photoId)
        setUser((u) => (u ? { ...u, profile: { ...u.profile, photoId: value.photoId } } : u));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha na conexão.');
    } finally {
      setBusy(false);
    }
  }
  async function photo(file: File) {
    try {
      if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024)
        throw new Error('Escolha PNG/JPEG de até 5 MB.');
      const bitmap = await createImageBitmap(file);
      const ratio = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const data = canvas.toDataURL('image/jpeg', 0.8);
      await action('account/photo', { mimeType: 'image/jpeg', base64: data.split(',')[1] });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível preparar a foto.');
    }
  }
  return (
    <WorkflowShell title="Conta e privacidade">
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      <div className="dashboard-grid">
        <section className="card">
          <h2>Autenticação em duas etapas</h2>
          <p className="muted">
            {user?.mfaEnabled
              ? 'Ativada.'
              : 'Adicione um aplicativo autenticador para proteger seu acesso. Obrigatória para operações administrativas.'}
          </p>
          {mfaSetup && (
            <div className="message">
              <p>
                Adicione manualmente esta chave ao seu aplicativo autenticador (TOTP, 6 dígitos, 30
                segundos):
              </p>
              <code style={{ overflowWrap: 'anywhere' }}>{mfaSetup.secret}</code>
              <p className="small">
                A chave aparece somente durante a configuração. Confirme o código abaixo para
                ativar.
              </p>
            </div>
          )}
          {recoveryCodes.length > 0 && (
            <div className="message">
              <strong>
                Guarde estes códigos em local seguro. Cada código funciona uma vez e não será
                exibido novamente.
              </strong>
              {recoveryCodes.map((code) => (
                <p key={code} style={{ overflowWrap: 'anywhere' }}>
                  <code>{code}</code>
                </p>
              ))}
              <button className="secondary" onClick={() => setRecoveryCodes([])}>
                Já guardei os códigos
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action(
                user?.mfaEnabled
                  ? 'account/mfa/disable'
                  : mfaSetup
                    ? 'account/mfa/confirm'
                    : 'account/mfa/setup',
                {
                  currentPassword: f.get('currentPassword'),
                  ...(user?.mfaEnabled || mfaSetup ? { code: f.get('code') } : {}),
                },
              );
            }}
          >
            <label>
              Senha atual para duas etapas
              <input
                type="password"
                name="currentPassword"
                required
                minLength={12}
                maxLength={128}
                autoComplete="current-password"
              />
            </label>
            {(user?.mfaEnabled || mfaSetup) && (
              <label style={{ marginTop: 16 }}>
                Código do autenticador ou recuperação
                <input name="code" required maxLength={64} autoComplete="one-time-code" />
              </label>
            )}
            <button disabled={busy} style={{ marginTop: 18 }}>
              {user?.mfaEnabled
                ? 'Desativar duas etapas'
                : mfaSetup
                  ? 'Confirmar e ativar'
                  : 'Configurar autenticador'}
            </button>
          </form>
        </section>
        <section className="card">
          <h2>Sua foto de perfil</h2>
          {user?.profile.photoId && (
            <img
              src={`/api/media/${user.profile.photoId}`}
              alt="Sua foto de perfil"
              width={120}
              height={120}
              style={{ borderRadius: '50%', objectFit: 'cover', marginBottom: 20 }}
            />
          )}
          <p className="muted small">
            A foto é privada, visível para você e em vínculos autorizados. Metadados adicionais são
            removidos.
          </p>
          <label>
            Escolher uma foto
            <input
              type="file"
              accept="image/png,image/jpeg"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void photo(file);
              }}
            />
          </label>
        </section>
        <section className="card">
          <h2>Alterar senha</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action('account/password', {
                currentPassword: f.get('currentPassword'),
                newPassword: f.get('newPassword'),
                ...(user?.mfaEnabled ? { code: f.get('code') } : {}),
              });
            }}
          >
            <label>
              Senha atual
              <input
                name="currentPassword"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="current-password"
              />
            </label>
            <label style={{ marginTop: 16 }}>
              Nova senha
              <input
                name="newPassword"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            {user?.mfaEnabled && (
              <label style={{ marginTop: 16 }}>
                Código do autenticador ou recuperação
                <input name="code" required maxLength={64} autoComplete="one-time-code" />
              </label>
            )}
            <button disabled={busy} style={{ marginTop: 18 }}>
              Atualizar e encerrar outras sessões
            </button>
          </form>
        </section>
        <section className="card">
          <h2>Exportar meus dados</h2>
          <p className="muted">
            Baixe seus dados pessoais, prescrições e históricos que pertencem à sua conta. Senhas e
            tokens de autenticação não entram na exportação.
          </p>
          <a href="/api/account/export" className="button" download>
            Baixar meus dados
          </a>
        </section>
        <section className="card">
          <h2>Encerrar conta e solicitar exclusão</h2>
          <p className="muted">
            A conta será desativada, sessões encerradas e vínculos revogados. A exclusão definitiva
            de registros profissionais depende de análise das obrigações de retenção. Exporte seus
            dados antes de continuar.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action('account/close', { confirmed: true });
            }}
          >
            <label className="consent">
              <input type="checkbox" required /> Entendo a desativação e a análise de retenção
              pendente.
            </label>
            <button className="danger" style={{ marginTop: 18 }} disabled={busy}>
              Desativar e solicitar exclusão
            </button>
          </form>
        </section>
      </div>
    </WorkflowShell>
  );
}
