import { fail, record, timestamp, uuid } from '@/lib/banco-mestre/data/validation';
import type { CreateProjectInput, UpdateProjectInput, CreateTaskInput, UpdateTaskInput } from './contracts';
export const PROJECT_TITLE_LIMIT = 200;
export const PROJECT_DESCRIPTION_LIMIT = 100000;
export function projectText(value: unknown, field: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.includes('\u0000') || Array.from(value).length > max || (required && !value.trim())) fail(field);
  return value;
}
function fields(input: unknown, update: boolean) {
  const v = record(input, 'project');
  const allowed = ['id', 'title', 'description', ...(update ? ['expectedUpdatedAt'] : [])];
  if (Object.keys(v).some(key => !allowed.includes(key))) fail('project.input');
  return v;
}
function values(v: Record<string, unknown>): CreateProjectInput {
  return {id: uuid(v.id), title: projectText(v.title, 'title', PROJECT_TITLE_LIMIT, true).trim(), description: projectText(v.description, 'description', PROJECT_DESCRIPTION_LIMIT)};
}
export function createProjectInput(input: unknown): CreateProjectInput { return values(fields(input, false)); }
export function updateProjectInput(input: unknown): UpdateProjectInput {
  const v = fields(input, true);
  return {...values(v), expectedUpdatedAt: timestamp(v.expectedUpdatedAt, 'expectedUpdatedAt')};
}
export function createTaskInput(input: unknown): CreateTaskInput {
  const v = record(input, 'task');
  if (Object.keys(v).some(key => !['id', 'projectId', 'title'].includes(key))) fail('task.input');
  return {id: uuid(v.id), projectId: uuid(v.projectId), title: projectText(v.title, 'title', PROJECT_TITLE_LIMIT, true).trim()};
}
export function updateTaskInput(input: unknown): UpdateTaskInput {
  const v = record(input, 'task');
  if (Object.keys(v).some(key => !['id', 'projectId', 'title', 'expectedUpdatedAt', 'completed'].includes(key)) || typeof v.completed !== 'boolean') fail('task.input');
  return {...createTaskInput({id: v.id, projectId: v.projectId, title: v.title}), completed: v.completed,
    expectedUpdatedAt: timestamp(v.expectedUpdatedAt, 'expectedUpdatedAt')};
}
