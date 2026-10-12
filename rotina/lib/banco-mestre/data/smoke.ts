import { createBancoMestreRepository, type BancoMestreClient } from './repository';
import { PersistenceError } from './errors';
import { uuid } from './validation';
import type { PersistedActivityBundle } from './contracts';

export type SmokeOptions = {write:false;activityId?:string} | {write:true};
export interface SmokeReport {
  areaCount:number; activityCount:number; aggregate:'found'|'not-found';
  fixture?:{activityId:string;createdArea:boolean;readBack:true;conflict:true;inactive:true};
}
/** Somente teste técnico por sessão normal; nunca é invocado pelo BancoMestreProvider. */
export async function runRepositorySmoke(client: BancoMestreClient, actorId: string, options: SmokeOptions): Promise<SmokeReport> {
  const owner=uuid(actorId,'session.sub');
  const repo=createBancoMestreRepository(client);
  const areas=await repo.listAreas(),activities=await repo.listActivities();
  const report:SmokeReport={areaCount:areas.length,activityCount:activities.length,aggregate:'not-found'};
  if(!options.write) {
    const id=options.activityId === undefined ? activities[0]?.activity.id ?? crypto.randomUUID() : uuid(options.activityId);
    try {await repo.getActivity(id);report.aggregate='found';}
    catch(error) {if(!(error instanceof PersistenceError && error.kind==='NotFound')) throw error;}
    return report;
  }
  let areaId=areas.find(a=>a.active)?.id,createdArea=false;
  if(!areaId) {
    // Inicialização MANUAL do smoke, nunca seed automático no login.
    const id=crypto.randomUUID();
    const {data,error}=await client.from('areas').insert({id,user_id:owner,name:'Área de teste do Rotina',active:true,sort_position:0}).select('id').single();
    if(error) throw error;
    areaId=uuid(data?.id,'smoke.area.id');createdArea=true;
  }
  const stamp=new Date().toISOString();
  let current:PersistedActivityBundle | undefined;
  try {
    current=await repo.saveActivity({activity:{id:crypto.randomUUID(),name:'Teste técnico do Rotina',areaId,status:'active',type:'variableActivity',defaultImportance:'optional',duration:{mode:'unknown'},config:{},createdAt:stamp,updatedAt:stamp},goals:[],rules:[],windows:[]});
    const previousRevision=current.revision;
    current=await repo.saveActivity({...current.bundle,activity:{...current.bundle.activity,name:'Teste técnico do Rotina — editado'}},previousRevision);
    if(current.revision<=previousRevision) throw new Error('Smoke revision did not advance');
    const read=await repo.getActivity(current.bundle.activity.id);
    if(read.revision!==current.revision || read.bundle.activity.name!==current.bundle.activity.name) throw new Error('Smoke aggregate mismatch');
    let conflict=false;
    try {await repo.saveActivity(current.bundle,previousRevision);}
    catch(error) {if(error instanceof PersistenceError && error.kind==='Conflict') conflict=true;else throw error;}
    if(!conflict) throw new Error('Smoke stale revision was accepted');
    report.aggregate='found';
    report.fixture={activityId:current.bundle.activity.id,createdArea,readBack:true,conflict:true,inactive:true};
  } finally {
    if(current) {
      current=await repo.saveActivity({...current.bundle,activity:{...current.bundle.activity,status:'inactive'}},current.revision);
      if(current.bundle.activity.status!=='inactive') throw new Error('Smoke fixture was not inactivated');
    }
  }
  return report;
}
