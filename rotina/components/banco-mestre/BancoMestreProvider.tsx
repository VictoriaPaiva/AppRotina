"use client";

import { createContext, useContext, type ReactNode } from 'react';
import type { Area } from '@/types/banco-mestre';
import type { ActivityBundle } from '@/lib/banco-mestre/editor';
import type { ActivitySummary } from '@/lib/banco-mestre/data/contracts';

interface ReadContext {
  areas:Area[];
  activities:ActivitySummary[];
  readOnly:true;
  save:(bundle:ActivityBundle)=>never;
}
const Context=createContext<ReadContext|null>(null);
function rejectWrite():never {throw new Error('O Banco Mestre está disponível somente para leitura.');}

export function BancoMestreProvider({children,areas=[],activities=[]}:{children:ReactNode;areas?:Area[];activities?:ActivitySummary[]}) {
  return <Context.Provider value={{areas,activities,readOnly:true,save:rejectWrite}}>{children}</Context.Provider>;
}

export function useBancoMestre() {
  const value = useContext(Context);
  if (!value) throw new Error('Banco Mestre deve estar dentro de seu provider.');
  return value;
}
