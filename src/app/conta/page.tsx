import { redirect } from 'next/navigation';
import { withDb } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { AccountSettings } from '@/components/account-settings';
export const dynamic = 'force-dynamic';
export default async function Account() {
  if (!(await withDb((db) => currentUser(db)))) redirect('/entrar');
  return <AccountSettings />;
}
