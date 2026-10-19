import type { BancoMestreClient } from './repository';
import { createBancoMestreRepository } from './repository';
import { runRepositorySmoke } from './smoke';
import { aggregateToRpc } from './mapper';
import { PersistenceError } from './errors';
import { integer, record, uuid, choice, fail } from './validation';
import type { PersistedActivityBundle } from './contracts';
import type { Database } from './database.types';

export const RLS_TABLES = ['areas','activities','reminder_configs','commitment_configs','planning_contexts','fixed_schedules','goals','recurrence_rules','time_windows'] as const;
export type RlsSmokeInput = {mode:'prepare'} | {mode:'attack'|'verify'|'anon';activityId:string;expectedRevision:number};
export interface RlsSmokeReport {
  ok:boolean;
  checks:Record<string,boolean>;
  codes:Record<string,string>;
  failedCheck?:string;
  fixture?:{activityId:string;revision:number;expectedName:string};
}
export function parseRlsSmokeInput(value:unknown):RlsSmokeInput {
  const v=record(value,'request');
  const mode=choice(v.mode,['prepare','attack','verify','anon'] as const,'mode');
  const allowed=mode==='prepare'?['mode']:['mode','activityId','expectedRevision'];
  if(Object.keys(v).some(k=>!allowed.includes(k))) fail('request');
  if(mode==='prepare') return {mode};
  return {mode,activityId:uuid(v.activityId),expectedRevision:integer(v.expectedRevision,'expectedRevision',1)};
}
// Only these codes can leave the server. Error messages/details never enter reports.
export function safeRlsCode(error:unknown):string {
  const code=typeof error==='object' && error!==null && 'code' in error ? error.code : null;
  return typeof code==='string' && ['42501','23503','23514','23502','23505','22023','22P02','PT409','40001','40P01','PGRST301','PGRST302','PGRST303'].includes(code) ? code : 'UNEXPECTED';
}
export function rlsGoalPayload(activityId:string,owner:string):Database['public']['Tables']['goals']['Insert'] {
  return {id:crypto.randomUUID(),activity_id:activityId,user_id:owner,enabled:true,metric:'count',unit:'execution',minimum_target:1,period:'week',starts_on:'2026-10-19',sort_position:0};
}
type Entry={owner:string;snapshot:PersistedActivityBundle;expires:number;busy:boolean;attacked:boolean;failed:boolean};
/** One dev server process, bounded ephemeral registry. No auth tokens or credentials.
 * Restart/HMR/expiry requires PREPARE again; no caller-supplied baseline or owner.
 */
export function createRlsSmokeHarness() {
  const entries=new Map<string,Entry>();
  const report=():RlsSmokeReport=>({ok:true,checks:{},codes:{}});
  function check(r:RlsSmokeReport,key:string,passed:boolean,error?:unknown):boolean {
    r.checks[key]=passed;
    if(error) r.codes[key]=safeRlsCode(error);
    if(!passed) {r.ok=false;r.failedCheck=key;}
    return passed;
  }
  async function ownLists(client:BancoMestreClient,actor:string,r:RlsSmokeReport) {
    for(const table of RLS_TABLES) {
      const key='ownRows_'+table;
      for(let offset=0;;offset+=200) {
        const {data,error}=await client.from(table).select('user_id').order(['reminder_configs','commitment_configs','planning_contexts'].includes(table)?'activity_id':'id').range(offset,offset+199);
        if(!check(r,key,!error && Array.isArray(data) && data.every(row=>row.user_id===actor),error)) return false;
        if(data!.length<200) break;
      }
    }
    return true;
  }
  return async function run(client:BancoMestreClient,actorId:string|null,input:RlsSmokeInput):Promise<RlsSmokeReport> {
    const r=report();
    const now=Date.now();
    for(const [id,e] of entries) if(e.expires<now && !e.busy) entries.delete(id);
    const actor=input.mode==='anon'?null:uuid(actorId,'session.sub');
    if(input.mode==='prepare') {
      if(entries.size>=32) throw new PersistenceError('Conflict');
      if(!await ownLists(client,actor!,r)) return r;
      // Reuse the existing create/edit/read/conflict/inactivate fixture lifecycle.
      const prepared=await runRepositorySmoke(client,actor!,{write:true});
      if(!prepared.fixture) throw new PersistenceError('Unknown');
      const snapshot=await createBancoMestreRepository(client).getActivity(prepared.fixture.activityId);
      if(snapshot.bundle.activity.status!=='inactive' || snapshot.bundle.goals.length || snapshot.bundle.rules.length || snapshot.bundle.windows.length) throw new PersistenceError('Unknown');
      entries.set(snapshot.bundle.activity.id,{owner:actor!,snapshot,expires:now+60*60*1000,busy:false,attacked:false,failed:false});
      r.fixture={activityId:snapshot.bundle.activity.id,revision:snapshot.revision,expectedName:snapshot.bundle.activity.name};
      return r;
    }
    const entry=entries.get(input.activityId);
    if(!entry || entry.snapshot.revision!==input.expectedRevision) throw new PersistenceError('Validation');
    if(entry.busy) throw new PersistenceError('Conflict');
    if(input.mode==='verify' && actor!==entry.owner || input.mode==='attack' && actor===entry.owner) throw new PersistenceError('Validation');
    if(input.mode==='attack' && (entry.failed || entry.attacked)) throw new PersistenceError('Conflict');
    entry.busy=true;
    try {
      const id=input.activityId;
      if(input.mode==='anon') {
        for(const table of RLS_TABLES) {
          const {data,error}=await client.from(table).select('user_id').limit(1);
          if(!check(r,'anonSelect_'+table,error?safeRlsCode(error)==='42501':Array.isArray(data)&&data.length===0,error)) return r;
        }
        const read=await client.rpc('get_activity_aggregate',{p_activity_id:id});
        if(!check(r,'anonGetRpcDenied',!!read.error && safeRlsCode(read.error)==='42501',read.error)) return r;
        const args=aggregateToRpc(entry.snapshot.bundle,entry.snapshot.revision);
        const write=await client.rpc('save_activity_aggregate',args);
        check(r,'anonSaveRpcDenied',!!write.error && safeRlsCode(write.error)==='42501',write.error);
        return r;
      }
      if(!await ownLists(client,actor!,r)) return r;
      if(input.mode==='verify') {
        const repo=createBancoMestreRepository(client);
        let current:PersistedActivityBundle;
        try {current=await repo.getActivity(id);}
        catch(error) {if(error instanceof PersistenceError && error.kind==='NotFound') {check(r,'fixtureExists',false);return r;}throw error;}
        check(r,'fixtureExists',true);
        if(!check(r,'nameUnchanged',current.bundle.activity.name===entry.snapshot.bundle.activity.name)) return r;
        if(!check(r,'revisionUnchanged',current.revision===entry.snapshot.revision)) return r;
        if(!check(r,'aggregateUnchanged',JSON.stringify(current.bundle)===JSON.stringify(entry.snapshot.bundle))) return r;
        const children=await client.from('goals').select('id').eq('activity_id',id);
        if(!check(r,'noUnexpectedChildren',!children.error && Array.isArray(children.data)&&children.data.length===0,children.error)) return r;
        check(r,'attackCompleted',entry.attacked && !entry.failed);
        return r;
      }
      const read=await client.rpc('get_activity_aggregate',{p_activity_id:id});
      if(!check(r,'crossReadDenied',!read.error && read.data===null,read.error)) return r;
      const args=aggregateToRpc({...entry.snapshot.bundle,activity:{...entry.snapshot.bundle.activity,name:'RLS smoke cross RPC write'}},entry.snapshot.revision);
      const write=await client.rpc('save_activity_aggregate',args);
      if(!check(r,'rpcWriteDenied',!!write.error && ['PT409','42501'].includes(safeRlsCode(write.error)),write.error)) return r;
      const update=await client.from('activities').update({name:'RLS smoke cross direct update'}).eq('id',id).select('id');
      if(!check(r,'directUpdateDenied',update.error?safeRlsCode(update.error)==='42501':Array.isArray(update.data)&&update.data.length===0,update.error)) return r;
      for(const [key,owner] of [['childInsertAsBRejected',actor!],['childInsertAsARejected',entry.owner]]) {
        const inserted=await client.from('goals').insert(rlsGoalPayload(id,owner)).select('id');
        if(!check(r,key,!!inserted.error && ['42501','23503'].includes(safeRlsCode(inserted.error)),inserted.error)) return r;
      }
      entry.attacked=true;
      return r;
    } catch(error) {
      // An interrupted write has an unknown outcome. Require owner verification.
      entry.failed=true;
      throw error;
    } finally {
      if(!r.ok) entry.failed=true;
      entry.busy=false;
    }
  };
}
export const runRlsSmoke=createRlsSmokeHarness();
