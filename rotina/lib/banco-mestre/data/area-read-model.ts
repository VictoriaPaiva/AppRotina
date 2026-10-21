import type { AreaRepository, ManagedArea } from './area-contracts';
import { readFailure, type ReadFailure } from './read-model';

export type ManagedAreasReadResult = {status:'ready';areas:ManagedArea[]}|ReadFailure;
export async function readManagedAreas(factory:()=>Promise<Pick<AreaRepository,'listManagedAreas'>>):Promise<ManagedAreasReadResult> {
  try {return {status:'ready',areas:await (await factory()).listManagedAreas()};}
  catch(error) {return readFailure(error);}
}
