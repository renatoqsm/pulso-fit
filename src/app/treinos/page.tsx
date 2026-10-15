import { redirect } from 'next/navigation';
import { withDb } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { WorkoutEditor } from '@/components/workout-editor';
export const dynamic = 'force-dynamic';
export default async function Workouts() {
  if (!(await withDb((db) => currentUser(db)))) redirect('/entrar');
  return <WorkoutEditor />;
}
