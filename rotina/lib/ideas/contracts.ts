import type { PersistenceErrorKind } from '@/lib/banco-mestre/data/errors';
export interface Idea { id: string; title: string; content: string; createdAt: string; updatedAt: string }
export interface CreateIdeaInput { id: string; title: string; content: string }
export interface UpdateIdeaInput extends CreateIdeaInput { expectedUpdatedAt: string }
export interface IdeaRepository {
  list(): Promise<Idea[]>;
  get(id: string): Promise<Idea>;
  create(input: CreateIdeaInput): Promise<Idea>;
  update(input: UpdateIdeaInput): Promise<Idea>;
}
export type IdeaResult = {ok: true; idea: Idea} | {ok: false; kind: PersistenceErrorKind; message: string};
