import { AuthLayout } from '@/components/auth-layout';
import { AuthForm } from '@/components/auth-form';
export default function Login() {
  return (
    <AuthLayout>
      <AuthForm mode="login" />
    </AuthLayout>
  );
}
