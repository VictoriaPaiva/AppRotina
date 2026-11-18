import type { PersistenceErrorKind } from '@/lib/banco-mestre/data/errors';
export interface Idea { id: string; title: string; content: string; createdAt: string; updatedAt: string }
export interface CreateIdeaInput { id: string; title: string; content: string }
export interface UpdateIdeaInput extends CreateIdeaInput { expectedUpdatedAt: string }
export interface DeleteIdeaInput { id: string; expectedUpdatedAt: string }
export interface IdeaRepository {
  list(): Promise<Idea[]>;
  get(id: string): Promise<Idea>;
  create(input: CreateIdeaInput): Promise<Idea>;
  update(input: UpdateIdeaInput): Promise<Idea>;
  delete(input: DeleteIdeaInput): Promise<void>;
}
export type IdeaResult = {ok: true; idea: Idea} | {ok: false; kind: PersistenceErrorKind; message: string};
export type DeleteIdeaResult = {ok: true} | Extract<IdeaResult, {ok: false}>;
