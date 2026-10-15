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
          <p>Monte seu treino e acompanhe cada conquista.</p>
        </div>
        <p className="small">Pulso Fit • Seus treinos, no seu ritmo.</p>
      </aside>
      <section className="auth-main">{children}</section>
    </main>
  );
}
