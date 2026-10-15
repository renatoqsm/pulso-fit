import { redirect } from 'next/navigation';
import { withDb } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { ExerciseCatalog } from '@/components/exercise-catalog';
export const dynamic = 'force-dynamic';
export default async function Exercises() {
  const user = await withDb((db) => currentUser(db));
  if (!user) redirect('/entrar');
  return <ExerciseCatalog role={user.role} />;
}
