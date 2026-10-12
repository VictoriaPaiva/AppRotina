/** PROVISÓRIO E MANUAL: derivado das migrations B.1/B.2A; não gerado pelo Supabase CLI.
 * Substituir por geração oficial quando a stack local completa estiver disponível.
 * Sem schema privado na API. Numeric aceita number|string na fronteira de transporte.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Relationship = { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[] };
type Owner<T extends string> = { foreignKeyName: `${T}_user_id_fkey`; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] };
type Parent<T extends string, One extends boolean = false> = { foreignKeyName: `${T}_user_id_activity_id_fkey`; columns: ["user_id", "activity_id"]; isOneToOne: One; referencedRelation: "activities"; referencedColumns: ["user_id", "id"] };
type Table<R, K extends keyof R, Relations extends Relationship[] = []> = { Row: R; Insert: Pick<R,K> & Partial<Omit<R,K>>; Update: Partial<R>; Relationships: Relations };

export type AreasRow = {
  id: string;
  user_id: string;
  name: string;
  active: boolean;
  sort_position: number;
  created_at: string;
  updated_at: string;
};

export type ActivitiesRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  area_id: string;
  status: string;
  type: string;
  default_importance: string;
  duration_mode: string;
  duration_minutes: number | null;
  min_duration_minutes: number | null;
  ideal_duration_minutes: number | null;
  revision: number;
  created_at: string;
  updated_at: string;
};

export type ReminderConfigsRow = {
  activity_id: string;
  user_id: string;
  reference_date: string;
  reminder_time: string | null;
  created_at: string;
  updated_at: string;
};

export type CommitmentConfigsRow = {
  activity_id: string;
  user_id: string;
  date: string;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
};

export type PlanningContextsRow = {
  activity_id: string;
  user_id: string;
  location: string | null;
  preparation_minutes: number | null;
  outbound_minutes: number | null;
  return_minutes: number | null;
  created_at: string;
  updated_at: string;
};

export type FixedSchedulesRow = {
  id: string;
  user_id: string;
  activity_id: string;
  weekdays: number[];
  start_time: string;
  end_time: string;
  sort_position: number;
  created_at: string;
  updated_at: string;
};

export type GoalsRow = {
  id: string;
  user_id: string;
  activity_id: string;
  enabled: boolean;
  metric: string;
  unit: string;
  minimum_target: number | string;
  ideal_target: number | string | null;
  period: string;
  starts_on: string;
  ends_on: string | null;
  sort_position: number;
  created_at: string;
  updated_at: string;
};

export type RecurrenceRulesRow = {
  id: string;
  user_id: string;
  activity_id: string;
  enabled: boolean;
  label: string | null;
  basis: string;
  pattern: string;
  interval_count: number;
  unit: string;
  anchor_date: string | null;
  weekdays: number[] | null;
  day_of_month: number | null;
  ordinal: number | null;
  weekday: number | null;
  invalid_date_policy: string | null;
  starts_on: string;
  ends_on: string | null;
  sort_position: number;
  created_at: string;
  updated_at: string;
};

export type TimeWindowsRow = {
  id: string;
  user_id: string;
  activity_id: string;
  recurrence_rule_id: string | null;
  kind: string;
  effect: string;
  coverage: string;
  weekdays: number[] | null;
  start_time: string | null;
  end_time: string | null;
  end_day_offset: number | null;
  starts_on: string;
  ends_on: string | null;
  sort_position: number;
  created_at: string;
  updated_at: string;
};

export type Database = { public: {
  Tables: {
    areas: Table<AreasRow, "user_id" | "name", [Owner<"areas">]>;
    activities: Table<ActivitiesRow, "user_id" | "name" | "area_id" | "type" | "default_importance", [Owner<"activities">, { foreignKeyName: "activities_user_id_area_id_fkey"; columns: ["user_id", "area_id"]; isOneToOne: false; referencedRelation: "areas"; referencedColumns: ["user_id", "id"] }]>;
    reminder_configs: Table<ReminderConfigsRow, "activity_id" | "user_id" | "reference_date", [Owner<"reminder_configs">, Parent<"reminder_configs", true>]>;
    commitment_configs: Table<CommitmentConfigsRow, "activity_id" | "user_id" | "date" | "start_time" | "end_time", [Owner<"commitment_configs">, Parent<"commitment_configs", true>]>;
    planning_contexts: Table<PlanningContextsRow, "activity_id" | "user_id", [Owner<"planning_contexts">, Parent<"planning_contexts", true>]>;
    fixed_schedules: Table<FixedSchedulesRow, "user_id" | "activity_id" | "weekdays" | "start_time" | "end_time", [Owner<"fixed_schedules">, Parent<"fixed_schedules">]>;
    goals: Table<GoalsRow, "user_id" | "activity_id" | "metric" | "unit" | "minimum_target" | "period" | "starts_on", [Owner<"goals">, Parent<"goals">]>;
    recurrence_rules: Table<RecurrenceRulesRow, "user_id" | "activity_id" | "basis" | "pattern" | "interval_count" | "unit" | "starts_on", [Owner<"recurrence_rules">, Parent<"recurrence_rules">]>;
    time_windows: Table<TimeWindowsRow, "user_id" | "activity_id" | "kind" | "effect" | "coverage" | "starts_on", [Owner<"time_windows">, Parent<"time_windows">, { foreignKeyName: "time_windows_user_id_activity_id_recurrence_rule_id_fkey"; columns: ["user_id", "activity_id", "recurrence_rule_id"]; isOneToOne: false; referencedRelation: "recurrence_rules"; referencedColumns: ["user_id", "activity_id", "id"] }]>;
  };
  Views: { [K in never]: never };
  Functions: {
    save_activity_aggregate: { Args: { p_activity: Json; p_relations?: Json; p_expected_revision?: number | null }; Returns: Json };
    get_activity_aggregate: { Args: { p_activity_id: string }; Returns: Json };
  };
  Enums: { [K in never]: never };
  CompositeTypes: { [K in never]: never };
} };
export type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
