import Link from 'next/link';
import { Activity } from 'lucide-react';
export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="logo" aria-label="Pulso Fit, início">
      <Activity size={28} /> pulso<span>fit</span>
    </Link>
  );
}
