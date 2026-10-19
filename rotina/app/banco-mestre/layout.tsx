import type { ReactNode } from 'react';
import { BancoMestreProvider } from '@/components/banco-mestre/BancoMestreProvider';

/** Scope the read-only context to this feature. Pages load their own real data. */
export default function BancoMestreLayout({children}:{children:ReactNode}) {
  return <BancoMestreProvider>{children}</BancoMestreProvider>;
}
