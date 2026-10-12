import type { Activity, Area } from '@/types/banco-mestre';
import type { ActivityBundle } from '@/lib/banco-mestre/editor';
import type { Database, Row } from './database.types';

/** Reutiliza o agregado existente: configs/contexto/grupos vivem em activity.config. */
export type { ActivityBundle } from '@/lib/banco-mestre/editor';
export interface PersistedActivityBundle { bundle: ActivityBundle; revision: number }
export type ActivitySummary = Omit<Activity, 'config'>;
export interface PersistedActivitySummary { activity: ActivitySummary; revision: number }
export interface DatabaseActivityAggregate {
  activity: Row<'activities'>;
  reminder_config: Row<'reminder_configs'> | null;
  commitment_config: Row<'commitment_configs'> | null;
  planning_context: Row<'planning_contexts'> | null;
  fixed_schedules: Row<'fixed_schedules'>[];
  goals: Row<'goals'>[];
  recurrence_rules: Row<'recurrence_rules'>[];
  time_windows: Row<'time_windows'>[];
}
export type SaveActivityAggregateArgs = Database['public']['Functions']['save_activity_aggregate']['Args'];
/** Após validação; a assinatura SQL retorna Json e exige refinamento em runtime. */
export type SaveActivityAggregateResult = DatabaseActivityAggregate;
export interface BancoMestreRepository {
  listActivities(): Promise<PersistedActivitySummary[]>;
  listAreas(): Promise<Area[]>;
  getActivity(id: string): Promise<PersistedActivityBundle>;
  /** NULL/ausente significa criação; edição exige revision retornada pelo servidor. */
  saveActivity(bundle: ActivityBundle, expectedRevision?: number): Promise<PersistedActivityBundle>;
}
