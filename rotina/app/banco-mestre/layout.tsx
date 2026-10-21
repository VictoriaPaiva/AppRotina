import type { ReactNode } from 'react';
import { BancoMestreProvider } from '@/components/banco-mestre/BancoMestreProvider';

/** Scope read data to this feature. Pages and forms use explicit server results. */
export default function BancoMestreLayout({children}:{children:ReactNode}) {
  return <BancoMestreProvider>{children}</BancoMestreProvider>;
}
