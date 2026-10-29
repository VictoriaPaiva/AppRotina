import { createClient } from '@/lib/supabase/server';
import { PersistenceError } from '@/lib/banco-mestre/data/errors';
import { readFailure } from '@/lib/banco-mestre/data/read-model';
import { createProjectRepository } from './repository';

export async function projectRepositoryForSession() {
  const client = await createClient();
  const {data, error} = await client.auth.getClaims();
  if (error || !data?.claims?.sub) throw new PersistenceError('Unauthorized');
  return createProjectRepository(client, data.claims.sub);
}
export async function readProjects() {
  try {
    const repo = await projectRepositoryForSession();
    const [projects, tasks] = await Promise.all([repo.list(), repo.taskProgress()]);
    return {status: 'ready' as const, projects, tasks};
  }
  catch (error) { return readFailure(error); }
}
export async function readProject(id: string) {
  try {
    const repo = await projectRepositoryForSession();
    const [project,tasks] = await Promise.all([repo.get(id),repo.tasks(id)]);
    return {status: 'ready' as const, project, tasks};
  }
  catch (error) { return readFailure(error); }
}
