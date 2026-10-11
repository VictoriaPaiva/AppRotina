/** Datas civis YYYY-MM-DD e horários locais HH:mm; não são instantes UTC. */
export type LocalDate = string;
export type LocalTime = string;
export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

/** O tipo determina a futura apresentação; não há trackingMode redundante. */
export type RoutineItemType = 'reminder' | 'commitment' | 'fixedActivity' | 'variableActivity' | 'checklistGoal';
export type ActivityType = RoutineItemType;
export type ActivityImportance = 'required' | 'important' | 'optional';
export type ActivityStatus = 'active' | 'inactive';
export type Duration =
  | { mode: 'fixed'; minutes: number }
  | { mode: 'minimumIdeal'; minMinutes: number; idealMinutes: number }
  | { mode: 'unknown' };
export interface Area { id: string; name: string; active: boolean }
export interface TravelTime { outboundMinutes?: number; returnMinutes?: number }
export interface PlanningContext { location?: string; preparationMinutes?: number; travel?: TravelTime }
export interface FixedSchedule { id: string; weekdays: Weekday[]; startTime: LocalTime; endTime: LocalTime }
interface ActivityBase {
  id: string; name: string; description?: string; areaId: Area['id']; status: ActivityStatus;
  defaultImportance: ActivityImportance; duration: Duration; createdAt: string; updatedAt: string;
}
/** Configuração por tipo. Relações Goal/RecurrenceRule/TimeWindow continuam separadas.
 * reminder: data sem bloco; commitment: horário datado; fixedActivity: grupos semanais;
 * variableActivity: horário só após planejamento; checklistGoal: fora da grade principal.
 * Apenas cadastro local: não reserva tempo, gera ocorrências ou dispara avisos. */
export type Activity = ActivityBase & (
  | { type: 'reminder'; config: { referenceDate: LocalDate; reminderTime?: LocalTime } }
  | { type: 'commitment'; config: PlanningContext & { date: LocalDate; startTime: LocalTime; endTime: LocalTime } }
  | { type: 'fixedActivity'; config: PlanningContext & { schedules: FixedSchedule[] } }
  | { type: 'variableActivity'; config: PlanningContext }
  | { type: 'checklistGoal'; config: Record<string, never> }
);

interface RuleValidity {
  startsOn: LocalDate;
  endsOn?: LocalDate;
}
interface RecurrenceBase extends RuleValidity {
  id: string;
  activityId: Activity['id'];
  enabled: boolean;
  label?: string;
}
export type InvalidDatePolicy = 'lastValidDay' | 'skip';
export type MonthOrdinal = 1 | 2 | 3 | 4 | 5 | 'last';

/** Frequência flexível (3x/semana) pertence a Goal, sem geração de dias fixos.
 * Quando necessário é ausência de recorrência automática, não um padrão especial. */
export type RecurrenceRule = RecurrenceBase & (
  | { basis: 'calendar'; pattern: 'interval'; interval: number; unit: 'day' | 'week'; anchorDate: LocalDate }
  | { basis: 'calendar'; pattern: 'interval'; interval: number; unit: 'month'; anchorDate: LocalDate; invalidDatePolicy: InvalidDatePolicy }
  | { basis: 'calendar'; pattern: 'weekdays'; interval: number; unit: 'week'; anchorDate: LocalDate; weekdays: Weekday[] }
  | { basis: 'calendar'; pattern: 'monthDay'; interval: number; unit: 'month'; dayOfMonth: number; anchorDate: LocalDate; invalidDatePolicy: InvalidDatePolicy }
  | { basis: 'calendar'; pattern: 'monthWeekday'; interval: number; unit: 'month'; ordinal: MonthOrdinal; weekday: Weekday; anchorDate: LocalDate; invalidDatePolicy: InvalidDatePolicy }
  | { basis: 'completion'; pattern: 'interval'; interval: number; unit: 'day'; anchorDate?: never }
  | { basis: 'completion'; pattern: 'interval'; interval: number; unit: 'month'; invalidDatePolicy: InvalidDatePolicy; anchorDate?: never }
);

interface GoalBase extends RuleValidity {
  id: string;
  activityId: Activity['id'];
  enabled: boolean;
  minimumTarget: number;
  idealTarget?: number;
  period: 'day' | 'week' | 'month';
}
/** Activity 1:N Goals. Metas semanais não criam dívida diária nem dias de execução.
 * Quantidades usam unidade explícita; conversões só na apresentação/registro futuro. */
export type Goal = GoalBase & (
  | { metric: 'count'; unit: 'execution' }
  | { metric: 'duration'; unit: 'minute' }
  | { metric: 'quantity'; unit: string }
);

interface TimeWindowBase extends RuleValidity {
  id: string;
  activityId: Activity['id'];
  recurrenceRuleId?: RecurrenceRule['id'];
  effect: 'allowed' | 'forbidden' | 'preferred';
  coverage: 'startOnly' | 'wholeActivity';
}
/** preferred ordena possibilidades; não impede horários fora da preferência. */
export type TimeWindow = TimeWindowBase & (
  | { kind: 'weekdays'; weekdays: Weekday[] }
  | { kind: 'timeRange'; weekdays?: Weekday[]; startTime: LocalTime; endTime: LocalTime; endDayOffset: 0 | 1 }
  | { kind: 'fixedStart'; weekdays?: Weekday[]; startTime: LocalTime; coverage: 'startOnly' }
);

export interface ActivityDependency {
  id: string;
  sourceActivityId: Activity['id'];
  targetActivityId: Activity['id'];
  event: 'completed' | 'plannedStart';
  /** Valor com sinal: -1 dia antes do início planejado, ou 0 após conclusão. */
  offset: { amount: number; unit: 'minute' | 'day' };
  enabled: boolean;
}

// Occurrence e motor de recorrência não fazem parte desta etapa.
