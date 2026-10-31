/** Generated with Supabase CLI 2.120.0: gen types typescript --linked --schema public.
 * daily_plan_items regenerated from the linked development schema on 2026-10-22.
 * ideas mirrored from migration 20261026000100; checked against PostgreSQL by data-layer tests.
 * projects/project_tasks mirrored through migration 20261031000100; checked by SQL tests.
 * financial_transactions mirrored from migration 20261027000200; checked by SQL tests.
 * fixed_expenses/months and linked transactions mirrored from 20261027000300.
 * All public schema contracts compared; compatibility aliases appended at the end.
 * Numeric transport validation remains in mapper/validation.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      fixed_expenses: {
        Row: { id: string; user_id: string; name: string; due_day: number; category: string; created_at: string; updated_at: string; default_amount_cents: number; active: boolean; starts_on: string }
        Insert: { id?: string; user_id: string; name: string; due_day: number; category?: string; created_at?: string; updated_at?: string; default_amount_cents: number; active?: boolean; starts_on: string }
        Update: { id?: string; user_id?: string; name?: string; due_day?: number; category?: string; created_at?: string; updated_at?: string; default_amount_cents?: number; active?: boolean; starts_on?: string }
        Relationships: []
      }
      fixed_expense_months: {
        Row: { id: string; user_id: string; name: string; due_day: number; category: string; created_at: string; updated_at: string; fixed_expense_id: string; reference_month: string; amount_cents: number; paid_at: string | null; financial_transaction_id: string | null }
        Insert: { id?: string; user_id: string; name: string; due_day: number; category: string; created_at?: string; updated_at?: string; fixed_expense_id: string; reference_month: string; amount_cents: number; paid_at?: string | null; financial_transaction_id?: string | null }
        Update: { id?: string; user_id?: string; name?: string; due_day?: number; category?: string; created_at?: string; updated_at?: string; fixed_expense_id?: string; reference_month?: string; amount_cents?: number; paid_at?: string | null; financial_transaction_id?: string | null }
        Relationships: [{ foreignKeyName: "fixed_expense_months_owner_expense_fkey"; columns: ["user_id", "fixed_expense_id"]; isOneToOne: false; referencedRelation: "fixed_expenses"; referencedColumns: ["user_id", "id"] }, { foreignKeyName: "fixed_expense_months_owner_transaction_fkey"; columns: ["user_id", "financial_transaction_id"]; isOneToOne: false; referencedRelation: "financial_transactions"; referencedColumns: ["user_id", "id"] }]
      }

      financial_transactions: {
        Row: { fixed_expense_month_id: string | null; id: string; user_id: string; type: string; date: string; amount_cents: number; description: string; category: string; created_at: string; updated_at: string }
        Insert: { fixed_expense_month_id?: string | null; id?: string; user_id: string; type: string; date: string; amount_cents: number; description: string; category: string; created_at?: string; updated_at?: string }
        Update: { fixed_expense_month_id?: string | null; id?: string; user_id?: string; type?: string; date?: string; amount_cents?: number; description?: string; category?: string; created_at?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: "financial_transactions_owner_bill_fkey"; columns: ["user_id", "fixed_expense_month_id"]; isOneToOne: false; referencedRelation: "fixed_expense_months"; referencedColumns: ["user_id", "id"] }]
      }
      projects: {
        Row: { progress_mode: string; manual_progress_percent: number; id: string; user_id: string; title: string; description: string; created_at: string; updated_at: string }
        Insert: { progress_mode?: string; manual_progress_percent?: number; id?: string; user_id: string; title: string; description?: string; created_at?: string; updated_at?: string }
        Update: { progress_mode?: string; manual_progress_percent?: number; id?: string; user_id?: string; title?: string; description?: string; created_at?: string; updated_at?: string }
        Relationships: []
      }
      project_tasks: {
        Row: { parent_task_id: string | null; progress_stage: string; progress_weight: number; id: string; user_id: string; project_id: string; title: string; completed_at: string | null; created_at: string; updated_at: string }
        Insert: { parent_task_id?: string | null; progress_stage?: string; progress_weight?: number; id?: string; user_id: string; project_id: string; title: string; completed_at?: string | null; created_at?: string; updated_at?: string }
        Update: { parent_task_id?: string | null; progress_stage?: string; progress_weight?: number; id?: string; user_id?: string; project_id?: string; title?: string; completed_at?: string | null; created_at?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: "project_tasks_owner_project_fkey"; columns: ["user_id", "project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["user_id", "id"] }, { foreignKeyName: "project_tasks_parent_fkey"; columns: ["user_id", "project_id", "parent_task_id"]; isOneToOne: false; referencedRelation: "project_tasks"; referencedColumns: ["user_id", "project_id", "id"] }]
      }

      ideas: {
        Row: { id: string; user_id: string; title: string; content: string; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; title: string; content?: string; created_at?: string; updated_at?: string }
        Update: { id?: string; user_id?: string; title?: string; content?: string; created_at?: string; updated_at?: string }
        Relationships: []
      }
      daily_plan_items: {
        Row: {
          activity_id: string
          completed_at: string | null
          created_at: string
          id: string
          planned_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          planned_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          planned_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_plan_items_owner_activity_fkey"
            columns: ["user_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      activities: {
        Row: {
          area_id: string
          created_at: string
          default_importance: string
          description: string | null
          duration_minutes: number | null
          duration_mode: string
          id: string
          ideal_duration_minutes: number | null
          min_duration_minutes: number | null
          name: string
          revision: number
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          area_id: string
          created_at?: string
          default_importance: string
          description?: string | null
          duration_minutes?: number | null
          duration_mode?: string
          id?: string
          ideal_duration_minutes?: number | null
          min_duration_minutes?: number | null
          name: string
          revision?: number
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          area_id?: string
          created_at?: string
          default_importance?: string
          description?: string | null
          duration_minutes?: number | null
          duration_mode?: string
          id?: string
          ideal_duration_minutes?: number | null
          min_duration_minutes?: number | null
          name?: string
          revision?: number
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_user_id_area_id_fkey"
            columns: ["user_id", "area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      areas: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort_position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort_position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      commitment_configs: {
        Row: {
          activity_id: string
          created_at: string
          date: string
          end_time: string
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          date: string
          end_time: string
          start_time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          date?: string
          end_time?: string
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitment_configs_user_id_activity_id_fkey"
            columns: ["user_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      fixed_schedules: {
        Row: {
          activity_id: string
          created_at: string
          end_time: string
          id: string
          sort_position: number
          start_time: string
          updated_at: string
          user_id: string
          weekdays: number[]
        }
        Insert: {
          activity_id: string
          created_at?: string
          end_time: string
          id?: string
          sort_position?: number
          start_time: string
          updated_at?: string
          user_id: string
          weekdays: number[]
        }
        Update: {
          activity_id?: string
          created_at?: string
          end_time?: string
          id?: string
          sort_position?: number
          start_time?: string
          updated_at?: string
          user_id?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "fixed_schedules_user_id_activity_id_fkey"
            columns: ["user_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      goals: {
        Row: {
          activity_id: string
          created_at: string
          enabled: boolean
          ends_on: string | null
          id: string
          ideal_target: number | null
          metric: string
          minimum_target: number
          period: string
          sort_position: number
          starts_on: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          enabled?: boolean
          ends_on?: string | null
          id?: string
          ideal_target?: number | null
          metric: string
          minimum_target: number
          period: string
          sort_position?: number
          starts_on: string
          unit: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          enabled?: boolean
          ends_on?: string | null
          id?: string
          ideal_target?: number | null
          metric?: string
          minimum_target?: number
          period?: string
          sort_position?: number
          starts_on?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_user_id_activity_id_fkey"
            columns: ["user_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      planning_contexts: {
        Row: {
          activity_id: string
          created_at: string
          location: string | null
          outbound_minutes: number | null
          preparation_minutes: number | null
          return_minutes: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          location?: string | null
          outbound_minutes?: number | null
          preparation_minutes?: number | null
          return_minutes?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          location?: string | null
          outbound_minutes?: number | null
          preparation_minutes?: number | null
          return_minutes?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_contexts_user_id_activity_id_fkey"
            columns: ["user_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      recurrence_rules: {
        Row: {
          activity_id: string
          anchor_date: string | null
          basis: string
          created_at: string
          day_of_month: number | null
          enabled: boolean
          ends_on: string | null
          id: string
          interval_count: number
          invalid_date_policy: string | null
          label: string | null
          ordinal: number | null
          pattern: string
          sort_position: number
          starts_on: string
          unit: string
          updated_at: string
          user_id: string
          weekday: number | null
          weekdays: number[] | null
        }
        Insert: {
          activity_id: string
          anchor_date?: string | null
          basis: string
          created_at?: string
          day_of_month?: number | null
          enabled?: boolean
          ends_on?: string | null
          id?: string
          interval_count: number
          invalid_date_policy?: string | null
          label?: string | null
          ordinal?: number | null
          pattern: string
          sort_position?: number
          starts_on: string
          unit: string
          updated_at?: string
          user_id: string
          weekday?: number | null
          weekdays?: number[] | null
        }
        Update: {
          activity_id?: string
          anchor_date?: string | null
          basis?: string
          created_at?: string
          day_of_month?: number | null
          enabled?: boolean
          ends_on?: string | null
          id?: string
          interval_count?: number
          invalid_date_policy?: string | null
          label?: string | null
          ordinal?: number | null
          pattern?: string
          sort_position?: number
          starts_on?: string
          unit?: string
          updated_at?: string
          user_id?: string
          weekday?: number | null
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "recurrence_rules_user_id_activity_id_fkey"
            columns: ["user_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      reminder_configs: {
        Row: {
          activity_id: string
          created_at: string
          reference_date: string
          reminder_time: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          reference_date: string
          reminder_time?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          reference_date?: string
          reminder_time?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_configs_user_id_activity_id_fkey"
            columns: ["user_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      time_windows: {
        Row: {
          activity_id: string
          coverage: string
          created_at: string
          effect: string
          end_day_offset: number | null
          end_time: string | null
          ends_on: string | null
          id: string
          kind: string
          recurrence_rule_id: string | null
          sort_position: number
          start_time: string | null
          starts_on: string
          updated_at: string
          user_id: string
          weekdays: number[] | null
        }
        Insert: {
          activity_id: string
          coverage: string
          created_at?: string
          effect: string
          end_day_offset?: number | null
          end_time?: string | null
          ends_on?: string | null
          id?: string
          kind: string
          recurrence_rule_id?: string | null
          sort_position?: number
          start_time?: string | null
          starts_on: string
          updated_at?: string
          user_id: string
          weekdays?: number[] | null
        }
        Update: {
          activity_id?: string
          coverage?: string
          created_at?: string
          effect?: string
          end_day_offset?: number | null
          end_time?: string | null
          ends_on?: string | null
          id?: string
          kind?: string
          recurrence_rule_id?: string | null
          sort_position?: number
          start_time?: string | null
          starts_on?: string
          updated_at?: string
          user_id?: string
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "time_windows_user_id_activity_id_fkey"
            columns: ["user_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "time_windows_user_id_activity_id_recurrence_rule_id_fkey"
            columns: ["user_id", "activity_id", "recurrence_rule_id"]
            isOneToOne: false
            referencedRelation: "recurrence_rules"
            referencedColumns: ["user_id", "activity_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      initialize_fixed_expense_month: { Args: { p_reference_month: string }; Returns: number }
      save_fixed_expense: { Args: { p_id: string; p_name: string; p_default_amount_cents: number; p_due_day: number; p_category: string; p_active: boolean; p_expected_updated_at?: string }; Returns: Json }
      save_fixed_expense_month: { Args: { p_id: string; p_amount_cents: number; p_paid: boolean; p_expected_updated_at: string }; Returns: Json }
      get_activity_aggregate: { Args: { p_activity_id: string }; Returns: Json }
      save_activity_aggregate: {
        Args: {
          p_activity: Json
          p_expected_revision?: number
          p_relations?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// Compatibility exports retained for existing persistence consumers.
export type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type ActivitiesRow = Row<"activities">;
export type AreasRow = Row<"areas">;
export type CommitmentConfigsRow = Row<"commitment_configs">;
export type FixedSchedulesRow = Row<"fixed_schedules">;
export type GoalsRow = Row<"goals">;
export type PlanningContextsRow = Row<"planning_contexts">;
export type RecurrenceRulesRow = Row<"recurrence_rules">;
export type ReminderConfigsRow = Row<"reminder_configs">;
export type TimeWindowsRow = Row<"time_windows">;
