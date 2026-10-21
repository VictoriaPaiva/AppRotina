'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAreaRepository } from '@/lib/banco-mestre/data/area-repository';
import { createAreaInput, renameAreaInput, setAreaActiveInput } from '@/lib/banco-mestre/data/area-validation';
import type { AreaMutationResult, AreaRepository, ManagedArea } from '@/lib/banco-mestre/data/area-contracts';
import { PersistenceError } from '@/lib/banco-mestre/data/errors';
import { readFailure } from '@/lib/banco-mestre/data/read-model';

async function mutate<T>(input: unknown, validate: (input: unknown)=>T,
  save: (repository: AreaRepository, input: T)=>Promise<ManagedArea>):Promise<AreaMutationResult> {
  try {
    const value=validate(input);
    const client=await createClient();
    const {data,error}=await client.auth.getClaims();
    if(error || !data?.claims?.sub) throw new PersistenceError('Unauthorized');
    const repository=createAreaRepository(client,data.claims.sub);
    const area=await save(repository,value);
    // Detail reads the area's name; edit reads area names and active options.
    // Invalidate every dependent route without a per-activity lookup or N+1.
    revalidatePath('/banco-mestre');
    revalidatePath('/banco-mestre/areas');
    revalidatePath('/banco-mestre/nova');
    revalidatePath('/banco-mestre/[id]','page');
    revalidatePath('/banco-mestre/[id]/editar','page');
    return {ok:true,area:{id:area.id,name:area.name,active:area.active,
      sortPosition:area.sortPosition,updatedAt:area.updatedAt}};
  } catch(error) {
    // Preserve Next control flow; expose only safe persistence categories/messages.
    const failure=readFailure(error);
    return {ok:false,kind:failure.kind,message:failure.message};
  }
}

export async function createMasterArea(input: unknown):Promise<AreaMutationResult> {
  return mutate(input,createAreaInput,(repository,value)=>repository.createArea(value));
}
export async function renameMasterArea(input: unknown):Promise<AreaMutationResult> {
  return mutate(input,renameAreaInput,(repository,value)=>repository.renameArea(value));
}
export async function setMasterAreaActive(input: unknown):Promise<AreaMutationResult> {
  return mutate(input,setAreaActiveInput,(repository,value)=>repository.setAreaActive(value));
}
