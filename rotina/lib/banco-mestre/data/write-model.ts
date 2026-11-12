import type { ActivityBundle, BancoMestreRepository } from './contracts';
import { aggregateToRpc } from './mapper';
import { readFailure } from './read-model';
import { choice, fail, integer, record } from './validation';
import { saveFailureDiagnostic, type PersistenceErrorKind } from './errors';
import { validateTree, validateSubitemDeletions } from '@/lib/activities/subitems';
import { checklistItems } from '@/lib/activities/checklist';

export type SaveActivityRequest={mode:'create';bundle:ActivityBundle}|{mode:'edit';bundle:ActivityBundle;expectedRevision:number;deletedSubitemIds?:string[]};
export type SaveActivityResult={ok:true;activityId:string;revision:number}|{ok:false;kind:PersistenceErrorKind;message:string};
/** Runtime validation is mandatory: a Server Action is a public input boundary. */
export async function saveBancoMestreActivity(factory:()=>Promise<Pick<BancoMestreRepository,'saveActivity'>>,input:unknown):Promise<SaveActivityResult> {
  try {
    const request=record(input,'request');
    const mode=choice(request.mode,['create','edit'] as const,'mode');
    const allowed=mode==='create'?['mode','bundle']:['mode','bundle','expectedRevision','deletedSubitemIds'];
    if(Object.keys(request).some(key=>!allowed.includes(key))) fail('request');
    const revision=mode==='edit'?integer(request.expectedRevision,'expectedRevision',1):undefined;
    const value=record(request.bundle,'bundle');
    if(Object.keys(value).some(key=>!['activity','goals','rules','windows','subitems','checklistItems','trackingMode'].includes(key))) fail('bundle');
    if(value.subitems!==undefined)validateTree(value.subitems);
    const deletions=request.deletedSubitemIds===undefined?[]:validateSubitemDeletions(request.deletedSubitemIds,validateTree(value.subitems));
    const activity=record(value.activity,'activity');
    if(value.checklistItems!==undefined){const checks=checklistItems(value.checklistItems);if(checks.length&&activity.type!=='checklistGoal')fail('checklist.type');}
    record(activity.duration,'duration');record(activity.config,'config');
    for(const key of ['goals','rules','windows']) if(!Array.isArray(value[key])) fail(key);
    const bundle=value as unknown as ActivityBundle;
    // Validate UUIDs, integers, ownership within the snapshot and the type matrix
    // before opening a client. The repository repeats validation at its boundary.
    aggregateToRpc(bundle,revision);
    const repository=await factory();
    const saved=deletions.length?await repository.saveActivity(bundle,revision,deletions):revision===undefined
      ? await repository.saveActivity(bundle)
      : await repository.saveActivity(bundle,revision);
    return {ok:true,activityId:saved.bundle.activity.id,revision:saved.revision};
  } catch(error) {
    const failure=readFailure(error);
    const diagnostic=saveFailureDiagnostic(error);
    if(process.env.NODE_ENV==='development')console.error('[BancoMestre/save]',JSON.stringify(diagnostic));
    if(diagnostic.missingRpc)return {ok:false,kind:failure.kind,message:'O salvamento necessário não está disponível neste ambiente. Seu rascunho foi mantido; verifique a atualização do banco antes de tentar novamente.'};
    return {ok:false,kind:failure.kind,message:failure.message};
  }
}
