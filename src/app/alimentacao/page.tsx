import { redirect } from 'next/navigation';
import { withDb } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { NutritionWorkspace } from '@/components/nutrition-workspace';
export const dynamic = 'force-dynamic';
export default async function Nutrition() {
  if (!(await withDb((db) => currentUser(db)))) redirect('/entrar');
  return <NutritionWorkspace />;
}
