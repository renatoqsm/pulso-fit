import { AuthLayout } from '@/components/auth-layout';
import { AuthForm } from '@/components/auth-form';
export default function Register() {
  return (
    <AuthLayout>
      <AuthForm mode="register" />
    </AuthLayout>
  );
}
