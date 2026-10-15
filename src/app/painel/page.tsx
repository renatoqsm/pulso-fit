import { redirect } from 'next/navigation';
import { withDb } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { Dashboard } from '@/components/dashboard';
export const dynamic = 'force-dynamic';
export default async function Panel() {
  const user = await withDb((db) => currentUser(db));
  if (!user) redirect('/entrar');
  return <Dashboard />;
}
