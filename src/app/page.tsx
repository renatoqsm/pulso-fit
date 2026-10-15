import Link from 'next/link';
import { ArrowUpRight, ShieldCheck, Users, Activity } from 'lucide-react';
import { Logo } from '@/components/logo';
export default function Home() {
  return (
    <>
      <header className="public-header row">
        <Logo />
        <Link className="button secondary" href="/entrar">
          Entrar <ArrowUpRight size={17} />
        </Link>
      </header>
      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">Seu movimento. Seu ritmo.</p>
            <h1>
              Uma rotina que
              <br />
              acompanha você.
            </h1>
            <p className="muted">
              O primeiro passo para cuidar da sua rotina de treinos. Monte suas fichas, escolha os
              dias da semana e acompanhe suas cargas e repetições.
            </p>
            <div className="row wrap" style={{ justifyContent: 'flex-start' }}>
              <Link className="button" href="/cadastro">
                Criar minha conta <ArrowUpRight size={18} />
              </Link>
            </div>
            <p className="small muted" style={{ marginTop: 22 }}>
              Treinos pessoais • Agenda semanal • Histórico de cargas
            </p>
          </div>
          <div className="hero-art">
            <div className="card">
              <span className="badge">COMECE PELO ESSENCIAL</span>
              <h2 style={{ marginTop: 20 }}>
                Seu próximo treino
                <br />
                começa aqui.
              </h2>
              <p className="muted">
                Crie suas fichas e encontre o treino do dia pronto para iniciar.
              </p>
              <div className="row">
                <span className="icon-tile" style={{ margin: 0 }}>
                  <Users />
                </span>
                <span className="small muted">Você escolhe como treinar.</span>
              </div>
            </div>
            <div className="card row">
              <ShieldCheck color="#206854" />
              <div>
                <h3 style={{ marginBottom: 4 }}>Privacidade desde o início</h3>
                <span className="small muted">Seus registros protegidos na sua conta.</span>
              </div>
            </div>
          </div>
        </section>
        <section className="grid-features">
          {[
            [Activity, 'Seu espaço', 'Monte e edite seus próprios treinos.'],
            [
              Users,
              'Agenda de treinos',
              'Escolha os dias de cada ficha e inicie o treino pela tela inicial.',
            ],
            [
              ShieldCheck,
              'Você no controle',
              'Retome seu treino e consulte suas cargas e repetições anteriores.',
            ],
          ].map(([Icon, title, text]) => {
            const Component = Icon as typeof Activity;
            return (
              <article className="card" key={String(title)}>
                <span className="icon-tile">
                  <Component />
                </span>
                <h3>{String(title)}</h3>
                <p className="muted small">{String(text)}</p>
              </article>
            );
          })}
        </section>
      </main>
    </>
  );
}
