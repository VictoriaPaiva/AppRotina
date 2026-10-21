import type { Area } from '@/types/banco-mestre';
import type { BancoMestreRepository, PersistedActivityBundle, ActivitySummary } from './contracts';
import { toPersistenceError, type PersistenceErrorKind } from './errors';
import { uuid } from './validation';
import { unstable_rethrow } from 'next/navigation';

export type BancoMestreReader=Pick<BancoMestreRepository,'listAreas'|'listActivities'|'getActivity'>;
export type ReadFailure={status:'error';kind:PersistenceErrorKind;message:string};
export type ListReadResult={status:'ready';areas:Area[];activities:ActivitySummary[]}|ReadFailure;
export type DetailReadResult={status:'ready';areas:Area[];item:PersistedActivityBundle}|ReadFailure;
export type AreasReadResult={status:'ready';areas:Area[]}|ReadFailure;
export function readFailure(error:unknown):ReadFailure {
  // Keep cookies/Suspense/redirect control flow out of persistence error UI.
  unstable_rethrow(error);
  const mapped=toPersistenceError(error);
  return {status:'error',kind:mapped.kind,message:mapped.message};
}
export async function readBancoMestreAreas(factory:()=>Promise<BancoMestreReader>):Promise<AreasReadResult> {
  try {return {status:'ready',areas:await (await factory()).listAreas()};}
  catch(error) {return readFailure(error);}
}
export async function readBancoMestreList(factory:()=>Promise<BancoMestreReader>):Promise<ListReadResult> {
  try {
    const repo=await factory();
    const [areas,items]=await Promise.all([repo.listAreas(),repo.listActivities()]);
    return {status:'ready',areas,activities:items.map(item=>item.activity)};
  } catch(error) {return readFailure(error);}
}
export async function readBancoMestreActivity(factory:()=>Promise<BancoMestreReader>,id:string):Promise<DetailReadResult> {
  try {
    const validId=uuid(id);
    const repo=await factory();
    const [areas,item]=await Promise.all([repo.listAreas(),repo.getActivity(validId)]);
    return {status:'ready',areas,item};
  } catch(error) {return readFailure(error);}
}
