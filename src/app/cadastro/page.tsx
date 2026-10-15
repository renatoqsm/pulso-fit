import { AuthLayout } from '@/components/auth-layout';
import { AuthForm } from '@/components/auth-form';
export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ perfil?: string }>;
}) {
  return (
    <AuthLayout>
      <AuthForm mode="register" professional={(await searchParams).perfil === 'profissional'} />
    </AuthLayout>
  );
}
