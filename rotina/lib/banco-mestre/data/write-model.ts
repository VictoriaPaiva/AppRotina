import type { ActivityBundle, BancoMestreRepository } from './contracts';
import { aggregateToRpc } from './mapper';
import { readFailure } from './read-model';
import { choice, fail, integer, record } from './validation';
import type { PersistenceErrorKind } from './errors';

export type SaveActivityRequest={mode:'create';bundle:ActivityBundle}|{mode:'edit';bundle:ActivityBundle;expectedRevision:number};
export type SaveActivityResult={ok:true;activityId:string;revision:number}|{ok:false;kind:PersistenceErrorKind;message:string};
/** Runtime validation is mandatory: a Server Action is a public input boundary. */
export async function saveBancoMestreActivity(factory:()=>Promise<Pick<BancoMestreRepository,'saveActivity'>>,input:unknown):Promise<SaveActivityResult> {
  try {
    const request=record(input,'request');
    const mode=choice(request.mode,['create','edit'] as const,'mode');
    const allowed=mode==='create'?['mode','bundle']:['mode','bundle','expectedRevision'];
    if(Object.keys(request).some(key=>!allowed.includes(key))) fail('request');
    const revision=mode==='edit'?integer(request.expectedRevision,'expectedRevision',1):undefined;
    const value=record(request.bundle,'bundle');
    if(Object.keys(value).some(key=>!['activity','goals','rules','windows'].includes(key))) fail('bundle');
    const activity=record(value.activity,'activity');
    record(activity.duration,'duration');record(activity.config,'config');
    for(const key of ['goals','rules','windows']) if(!Array.isArray(value[key])) fail(key);
    const bundle=value as unknown as ActivityBundle;
    // Validate UUIDs, integers, ownership within the snapshot and the type matrix
    // before opening a client. The repository repeats validation at its boundary.
    aggregateToRpc(bundle,revision);
    const repository=await factory();
    const saved=revision===undefined
      ? await repository.saveActivity(bundle)
      : await repository.saveActivity(bundle,revision);
    return {ok:true,activityId:saved.bundle.activity.id,revision:saved.revision};
  } catch(error) {
    const failure=readFailure(error);
    return {ok:false,kind:failure.kind,message:failure.message};
  }
}
