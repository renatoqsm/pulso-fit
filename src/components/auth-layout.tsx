import { Logo } from './logo';
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-layout">
      <aside className="auth-aside">
        <Logo />
        <div>
          <p className="eyebrow" style={{ color: 'var(--lime)' }}>
            Evolua no seu ritmo
          </p>
          <h1>
            Um passo hoje.
            <br />
            Uma nova rotina amanhã.
          </h1>
          <p>Seu espaço para conectar saúde, movimento e acompanhamento profissional.</p>
        </div>
        <p className="small">Pulso Fit • Treino e nutrição com você no controle.</p>
      </aside>
      <section className="auth-main">{children}</section>
    </main>
  );
}
