'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo } from './logo';
export function WorkflowShell({ title, children }: { title: string; children: React.ReactNode }) {
  const [modules, setModules] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/workspace')
      .then((r) => r.json())
      .then((v) => setModules(v.modules ?? []))
      .catch(() => {});
  }, []);
  return (
    <main className="main">
      <header className="row wrap">
        <Logo />
        <nav className="row wrap">
          <Link href="/painel" className="button secondary">
            Meu espaço
          </Link>
          {modules.includes('TRAINING') && (
            <>
              <Link href="/treinos" className="button secondary">
                Treinos
              </Link>
              <Link href="/evolucao" className="button secondary">
                Evolução
              </Link>
            </>
          )}
          {modules.includes('NUTRITION') && (
            <Link href="/alimentacao" className="button secondary">
              Alimentação
            </Link>
          )}
          <Link href="/conta" className="button secondary">
            Conta
          </Link>
        </nav>
      </header>
      <h1 style={{ fontSize: 38, marginTop: 38 }}>{title}</h1>
      {children}
    </main>
  );
}
