import { fail, record, timestamp, uuid } from '@/lib/banco-mestre/data/validation';
import type { CreateIdeaInput, UpdateIdeaInput } from './contracts';
export const IDEA_TITLE_LIMIT = 200;
export const IDEA_CONTENT_LIMIT = 100000;
export function ideaText(value: unknown, field: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.includes('\u0000') || Array.from(value).length > max || (required && !value.trim())) fail(field);
  return value;
}
function fields(input: unknown, update: boolean) {
  const v = record(input, 'idea');
  const allowed = ['id', 'title', 'content', ...(update ? ['expectedUpdatedAt'] : [])];
  if (Object.keys(v).some(key => !allowed.includes(key))) fail('idea.input');
  return v;
}
function values(v: Record<string, unknown>): CreateIdeaInput {
  return {id: uuid(v.id), title: ideaText(v.title, 'title', IDEA_TITLE_LIMIT, true).trim(), content: ideaText(v.content, 'content', IDEA_CONTENT_LIMIT)};
}
export function createIdeaInput(input: unknown): CreateIdeaInput { return values(fields(input, false)); }
export function updateIdeaInput(input: unknown): UpdateIdeaInput {
  const v = fields(input, true);
  return {...values(v), expectedUpdatedAt: timestamp(v.expectedUpdatedAt, 'expectedUpdatedAt')};
}
