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
              O primeiro passo para cuidar da sua rotina de treinos e alimentação. Crie seu perfil e
              conecte-se a profissionais com habilitações verificadas.
            </p>
            <div className="row wrap" style={{ justifyContent: 'flex-start' }}>
              <Link className="button" href="/cadastro">
                Criar minha conta <ArrowUpRight size={18} />
              </Link>
              <Link className="button secondary" href="/cadastro?perfil=profissional">
                Sou profissional
              </Link>
            </div>
            <p className="small muted" style={{ marginTop: 22 }}>
              Em desenvolvimento • Cadastro, perfis e vínculos disponíveis.
            </p>
          </div>
          <div className="hero-art">
            <div className="card">
              <span className="badge">COMECE PELO ESSENCIAL</span>
              <h2 style={{ marginTop: 20 }}>
                Sua jornada começa
                <br />
                com uma conexão.
              </h2>
              <p className="muted">
                Treinador e nutricionista, cada um com sua área de atuação e suas permissões.
              </p>
              <div className="row">
                <span className="icon-tile" style={{ margin: 0 }}>
                  <Users />
                </span>
                <span className="small muted">Você escolhe o que compartilhar.</span>
              </div>
            </div>
            <div className="card row">
              <ShieldCheck color="#206854" />
              <div>
                <h3 style={{ marginBottom: 4 }}>Privacidade desde o início</h3>
                <span className="small muted">Consentimento explícito. Controle de acesso.</span>
              </div>
            </div>
          </div>
        </section>
        <section className="grid-features">
          {[
            [Activity, 'Seu espaço', 'Comece com um perfil pessoal, mesmo sem profissional.'],
            [
              Users,
              'Acompanhamento conectado',
              'Aceite convites de profissionais e gerencie seus vínculos.',
            ],
            [
              ShieldCheck,
              'Você no controle',
              'Autorize o acesso por área e encerre o vínculo quando precisar.',
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
