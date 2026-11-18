'use server';
import { revalidatePath } from 'next/cache';
import { ideaRepositoryForSession } from '@/lib/ideas/server';
import { createIdeaInput, updateIdeaInput, deleteIdeaInput } from '@/lib/ideas/validation';
import type { IdeaRepository, IdeaResult, Idea, DeleteIdeaResult } from '@/lib/ideas/contracts';
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
export async function deleteIdea(input: unknown): Promise<DeleteIdeaResult> {
  try {
    const value=deleteIdeaInput(input),repo=await ideaRepositoryForSession();
    await repo.delete(value);
    revalidatePath('/ideias');revalidatePath(`/ideias/${value.id}`);
    return {ok:true};
  }catch(error){
    const failure=readFailure(error);
    const message=failure.kind==='NotFound'?'Esta ideia não está disponível ou já foi excluída.'
      :failure.kind==='Conflict'?'A ideia foi alterada em outra sessão. Recarregue os dados salvos antes de excluir.'
      :failure.kind==='Unknown'?'Não foi possível confirmar a exclusão. Consulte a lista de ideias antes de tentar novamente.'
      :failure.message;
    return {ok:false,kind:failure.kind,message};
  }
}
