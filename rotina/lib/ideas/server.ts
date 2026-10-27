import { createClient } from '@/lib/supabase/server';
import { PersistenceError } from '@/lib/banco-mestre/data/errors';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
import { createIdeaRepository } from './repository';

export async function ideaRepositoryForSession() {
  const client = await createClient();
  const {data, error} = await client.auth.getClaims();
  if (error || !data?.claims?.sub) throw new PersistenceError('Unauthorized');
  return createIdeaRepository(client, data.claims.sub);
}
export async function readIdeas() {
  try { return {status: 'ready' as const, ideas: await (await ideaRepositoryForSession()).list()}; }
  catch (error) { return readFailure(error); }
}
export async function readIdea(id: string) {
  try { return {status: 'ready' as const, idea: await (await ideaRepositoryForSession()).get(id)}; }
  catch (error) { return readFailure(error); }
}
