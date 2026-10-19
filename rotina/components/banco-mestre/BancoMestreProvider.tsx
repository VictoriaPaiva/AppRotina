"use client";

import { createContext, useContext, type ReactNode } from 'react';
import type { Area } from '@/types/banco-mestre';
import type { ActivitySummary } from '@/lib/banco-mestre/data/contracts';

interface ReadContext {
  areas:Area[];
  activities:ActivitySummary[];
}
const Context=createContext<ReadContext|null>(null);

export function BancoMestreProvider({children,areas=[],activities=[]}:{children:ReactNode;areas?:Area[];activities?:ActivitySummary[]}) {
  return <Context.Provider value={{areas,activities}}>{children}</Context.Provider>;
}

export function useBancoMestre() {
  const value = useContext(Context);
  if (!value) throw new Error('Banco Mestre deve estar dentro de seu provider.');
  return value;
}
