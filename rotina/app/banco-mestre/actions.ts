'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createBancoMestreRepository } from '@/lib/banco-mestre/data/repository';
import { PersistenceError } from '@/lib/banco-mestre/data/errors';
import { saveBancoMestreActivity, type SaveActivityResult } from '@/lib/banco-mestre/data/write-model';

/** Next Server Action POST/origin protection + normal verified cookie session. */
export async function saveMasterActivity(input:unknown):Promise<SaveActivityResult> {
  const result=await saveBancoMestreActivity(async()=>{
    const client=await createClient();
    const {data,error}=await client.auth.getClaims();
    if(error || !data?.claims?.sub) throw new PersistenceError('Unauthorized');
    return createBancoMestreRepository(client);
  },input);
  if(result.ok) {
    revalidatePath('/banco-mestre');
    revalidatePath('/banco-mestre/'+result.activityId);
  }
  return result;
}
