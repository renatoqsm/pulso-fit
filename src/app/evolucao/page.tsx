import { redirect } from 'next/navigation';
import { withDb } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { ProgressView } from '@/components/progress-view';
export const dynamic = 'force-dynamic';
export default async function Progress() {
  if (!(await withDb((db) => currentUser(db)))) redirect('/entrar');
  return <ProgressView />;
}
