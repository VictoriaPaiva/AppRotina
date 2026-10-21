import { createClient } from '@/lib/supabase/server';
import { createAreaRepository } from './area-repository';
import { PersistenceError } from './errors';
import type { AreaRepository } from './area-contracts';

export async function createManagedAreasReader():Promise<Pick<AreaRepository,'listManagedAreas'>> {
  const client=await createClient();
  const {data,error}=await client.auth.getClaims();
  if(error || !data?.claims?.sub) throw new PersistenceError('Unauthorized');
  const repository=createAreaRepository(client,data.claims.sub);
  return {listManagedAreas:repository.listManagedAreas};
}
