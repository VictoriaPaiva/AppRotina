/** Generated with Supabase CLI 2.120.0: gen types typescript --linked --schema public.
 * Generated schema is unchanged below; compatibility aliases are appended at the end.
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
