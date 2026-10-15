'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Dumbbell,
  CalendarDays,
  Utensils,
  BookOpen,
  TrendingUp,
  Settings,
  Menu,
  X,
  LogOut,
  Users,
} from 'lucide-react';
import { Logo } from './logo';
import { clearOffline } from '@/lib/session-queue';
export function WorkflowShell({
  title,
  children,
  activeHref,
}: {
  title: string;
  children: React.ReactNode;
  activeHref?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [modules, setModules] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [hash, setHash] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dateLabel, setDateLabel] = useState('Sua rotina');
  useEffect(
    () =>
      setDateLabel(
        new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date()),
      ),
    [],
  );
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/workspace', { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        setModules(data.modules ?? []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.querySelector<HTMLAnchorElement>('#app-navigation nav a')?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        document.getElementById('navigation-toggle')?.focus();
      }
    };
    window.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', escape);
    };
  }, [open]);
  const entries = [
    { href: '/painel', label: 'Meu dia', icon: LayoutDashboard },
    ...(modules.includes('TRAINING')
      ? [
          { href: '/treinos#atuais', label: 'Treino atual', icon: Dumbbell },
          { href: '/treinos#programas', label: 'Planos de treino', icon: CalendarDays },
          { href: '/exercicios', label: 'Biblioteca de exercícios', icon: BookOpen },
          { href: '/evolucao', label: 'Minha evolução', icon: TrendingUp },
        ]
      : []),
    ...(modules.includes('NUTRITION')
      ? [
          { href: '/alimentacao#plans', label: 'Planos alimentares', icon: Utensils },
          { href: '/alimentacao#diary', label: 'Diário alimentar', icon: CalendarDays },
        ]
      : []),
    { href: '/painel#vinculos', label: 'Perfil e vínculos', icon: Users },
    { href: '/conta', label: 'Conta e privacidade', icon: Settings },
  ];
  async function logout() {
    setBusy(true);
    setError('');
    try {
      const me = await fetch('/api/me').then((r) => r.json());
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('Não foi possível sair. Tente novamente.');
      await clearOffline(me.user?.id ?? me.id ?? '');
      router.push('/entrar');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao sair.');
      setBusy(false);
    }
  }
  return (
    <div className="app-shell routine-shell">
      <div className="mobile-navigation">
        <Logo href="/painel" />
        <button
          id="navigation-toggle"
          className="secondary"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={open}
          aria-controls="app-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <button
          className="navigation-backdrop"
          aria-label="Fechar navegação"
          onClick={() => setOpen(false)}
        />
      )}
      <aside id="app-navigation" className={`sidebar routine-sidebar ${open ? 'is-open' : ''}`}>
        <div className="sidebar-brand">
          <Logo href="/painel" />
          <span className="eyebrow">Sua rotina, em movimento</span>
        </div>
        <nav aria-label="Navegação principal">
          {entries.map(({ href, label, icon: Icon }) => {
            const [path, anchor] = href.split('#');
            const active = activeHref
              ? href === activeHref
              : pathname === path &&
                (anchor
                  ? hash === '#' + anchor || (!hash && (anchor === 'atuais' || anchor === 'diary'))
                  : !hash);
            return (
              <Link
                key={href}
                href={href}
                className={active ? 'is-active' : ''}
                aria-current={active ? 'page' : undefined}
                onClick={(event) => {
                  if (pathname === path && anchor) {
                    event.preventDefault();
                    if (window.location.hash === '#' + anchor)
                      window.dispatchEvent(new HashChangeEvent('hashchange'));
                    else window.location.hash = anchor;
                  }
                  setHash(anchor ? '#' + anchor : '');
                  setOpen(false);
                }}
              >
                <Icon size={19} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <p>
            Um passo de cada vez.
            <br />
            Sua rotina começa aqui.
          </p>
          <button className="secondary full" disabled={busy} onClick={logout}>
            <LogOut size={17} /> Sair da conta
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      </aside>
      <main id="main-content" className="main routine-main" inert={open || undefined}>
        <header className="page-heading">
          <div>
            <p className="eyebrow">PULSO FIT · SEU ESPAÇO</p>
            <h1>{title}</h1>
          </div>
          <Link href="/painel" className="today-date">
            {dateLabel}
          </Link>
        </header>
        {children}
      </main>
    </div>
  );
}
