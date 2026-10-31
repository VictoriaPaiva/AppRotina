import { fail, record, timestamp, uuid } from '@/lib/banco-mestre/data/validation';
import type { CreateProjectInput, UpdateProjectInput, CreateTaskInput, UpdateTaskInput, ProgressMode, ProgressStage } from './contracts';
export const STAGES: ProgressStage[] = ['not_started','started','early_progress','in_progress','advanced','finishing','completed'];
export function progressStage(value: unknown): ProgressStage {
  if (!STAGES.includes(value as ProgressStage)) fail('progressStage');
  return value as ProgressStage;
}
export function progressMode(value: unknown): ProgressMode {
  if (!['tasks','manual','hybrid'].includes(value as string)) fail('progressMode');
  return value as ProgressMode;
}
export function progressInteger(value: unknown, max: number, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail('progress');
  return value as number;
}
export const PROJECT_TITLE_LIMIT = 200;
export const PROJECT_DESCRIPTION_LIMIT = 100000;
export function projectText(value: unknown, field: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.includes('\u0000') || Array.from(value).length > max || (required && !value.trim())) fail(field);
  return value;
}
function fields(input: unknown, update: boolean) {
  const v = record(input, 'project');
  const allowed = ['id', 'title', 'description', 'progressMode', 'manualProgressPercent', ...(update ? ['expectedUpdatedAt'] : [])];
  if (Object.keys(v).some(key => !allowed.includes(key))) fail('project.input');
  return v;
}
function values(v: Record<string, unknown>): CreateProjectInput {
  return {id: uuid(v.id), title: projectText(v.title, 'title', PROJECT_TITLE_LIMIT, true).trim(), description: projectText(v.description, 'description', PROJECT_DESCRIPTION_LIMIT),
    progressMode: progressMode(v.progressMode === undefined ? 'tasks' : v.progressMode), manualProgressPercent: progressInteger(v.manualProgressPercent === undefined ? 0 : v.manualProgressPercent, 100)};
}
export function createProjectInput(input: unknown): CreateProjectInput { return values(fields(input, false)); }
export function updateProjectInput(input: unknown): UpdateProjectInput {
  const v = fields(input, true);
  return {...values(v), expectedUpdatedAt: timestamp(v.expectedUpdatedAt, 'expectedUpdatedAt')};
}
export function createTaskInput(input: unknown): CreateTaskInput {
  const v = record(input, 'task');
  if (Object.keys(v).some(key => !['id', 'projectId', 'title', 'parentTaskId', 'progressStage', 'progressWeight'].includes(key))) fail('task.input');
  const id = uuid(v.id), parentTaskId = v.parentTaskId == null ? null : uuid(v.parentTaskId);
  if (id === parentTaskId) fail('parentTaskId');
  return {id, projectId: uuid(v.projectId), title: projectText(v.title, 'title', PROJECT_TITLE_LIMIT, true).trim(), parentTaskId,
    progressStage: progressStage(v.progressStage === undefined ? 'not_started' : v.progressStage), progressWeight: progressInteger(v.progressWeight === undefined ? 1 : v.progressWeight, 2147483647, 1)};
}
export function updateTaskInput(input: unknown): UpdateTaskInput {
  const v = record(input, 'task');
  if (Object.keys(v).some(key => !['id', 'projectId', 'title', 'expectedUpdatedAt', 'completed', 'progressStage', 'progressWeight'].includes(key)) || typeof v.completed !== 'boolean') fail('task.input');
  const stage = progressStage(v.progressStage === undefined ? (v.completed ? 'completed' : 'not_started') : v.progressStage);
  if ((stage === 'completed') !== v.completed) fail('task.completion');
  return {id: uuid(v.id), projectId: uuid(v.projectId), title: projectText(v.title, 'title', PROJECT_TITLE_LIMIT, true).trim(), progressStage: stage,
    progressWeight: progressInteger(v.progressWeight === undefined ? 1 : v.progressWeight, 2147483647, 1), completed: v.completed,
    expectedUpdatedAt: timestamp(v.expectedUpdatedAt, 'expectedUpdatedAt')};
}
