import { createClient } from '@/lib/supabase/server';
import { createBancoMestreRepository } from './repository';
import type { BancoMestreReader } from './read-model';

/** Per-request authenticated client. No cache, seed or write method exposed. */
export async function createBancoMestreReader():Promise<BancoMestreReader> {
  const repo=createBancoMestreRepository(await createClient());
  return {listAreas:repo.listAreas,listActivities:repo.listActivities,getActivity:repo.getActivity};
}
