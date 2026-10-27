'use server';
import { revalidatePath } from 'next/cache';
import { ideaRepositoryForSession } from '@/lib/ideas/server';
import { createIdeaInput, updateIdeaInput } from '@/lib/ideas/validation';
import type { IdeaRepository, IdeaResult, Idea } from '@/lib/ideas/contracts';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
async function mutate<T>(input: unknown, validate: (input: unknown) => T, save: (repo: IdeaRepository, value: T) => Promise<Idea>): Promise<IdeaResult> {
  try {
    const value = validate(input), repo = await ideaRepositoryForSession();
    const idea = await save(repo, value);
    revalidatePath('/ideias'); revalidatePath(`/ideias/${idea.id}`);
    return {ok: true, idea};
  } catch (error) {
    const failure = readFailure(error);
    return {ok: false, kind: failure.kind, message: failure.message};
  }
}
export async function createIdea(input: unknown): Promise<IdeaResult> { return mutate(input, createIdeaInput, (repo, value) => repo.create(value)); }
export async function updateIdea(input: unknown): Promise<IdeaResult> { return mutate(input, updateIdeaInput, (repo, value) => repo.update(value)); }
