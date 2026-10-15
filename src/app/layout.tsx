import type { Metadata } from 'next';
import './globals.css';
import { PwaRegistration } from '@/components/pwa-registration';
export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  title: 'Pulso Fit | Seu treino',
  description: 'Monte seus treinos, escolha os dias e acompanhe sua evolução.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
