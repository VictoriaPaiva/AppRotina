"use client";

import { createContext, useContext, useState, type ReactNode } from 'react';
import { mockActivities, mockAreas, mockGoals, mockRecurrenceRules, mockTimeWindows } from '@/lib/banco-mestre/mock-data';
import { saveBundle, type ActivityBundle, type MasterState } from '@/lib/banco-mestre/editor';

const Context = createContext<(MasterState & { areas: typeof mockAreas; save: (bundle: ActivityBundle) => void }) | null>(null);

export function BancoMestreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MasterState>(() => ({ activities: [...mockActivities], goals: [...mockGoals], rules: [...mockRecurrenceRules], windows: [...mockTimeWindows] }));
  return <Context.Provider value={{ ...state, areas: mockAreas, save: bundle => setState(current => saveBundle(current, bundle)) }}>{children}</Context.Provider>;
}

export function useBancoMestre() {
  const value = useContext(Context);
  if (!value) throw new Error('Banco Mestre deve estar dentro de seu provider local.');
  return value;
}
