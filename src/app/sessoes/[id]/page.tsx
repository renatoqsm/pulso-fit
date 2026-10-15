import { redirect } from 'next/navigation';
import { withDb } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { SessionRunner } from '@/components/session-runner';
export const dynamic = 'force-dynamic';
export default async function Session({ params }: { params: Promise<{ id: string }> }) {
  if (!(await withDb((db) => currentUser(db)))) redirect('/entrar');
  return <SessionRunner id={(await params).id} />;
}
