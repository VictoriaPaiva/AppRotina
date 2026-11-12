import type { SupabaseClient } from '@supabase/supabase-js';
import type { Area } from '@/types/banco-mestre';
import type { Database } from './database.types';
import type { BancoMestreRepository, PersistedActivitySummary } from './contracts';
import { aggregateFromDatabase, aggregateToRpc, activitySummaryFromDatabase, areaFromDatabase } from './mapper';
import { PersistenceError, toPersistenceError } from './errors';
import { choice, fail, integer, record, uuid } from './validation';
import { validateTree, validateSubitemDeletions } from '@/lib/activities/subitems';
import { checklistItems } from '@/lib/activities/checklist';
import type { Json } from './database.types';

export type BancoMestreClient = Pick<SupabaseClient<Database>, 'from' | 'rpc'>;
export const ACTIVITY_LIST_COLUMNS = 'id,user_id,name,description,area_id,status,type,default_importance,duration_mode,duration_minutes,min_duration_minutes,ideal_duration_minutes,revision,created_at,updated_at,child_selection_mode';
export const AREA_LIST_COLUMNS = 'id,user_id,name,active,sort_position,created_at,updated_at';
const PAGE_SIZE=500;
/** Dependência por instância: funciona com as factories browser/server, sem singleton/sessão global. */
export function createBancoMestreRepository(client: BancoMestreClient): BancoMestreRepository {
  const operation=async <T>(fn:()=>Promise<T>):Promise<T>=>{
    try { return await fn(); } catch(error) { throw toPersistenceError(error); }
  };
  return {
    listSubitems:()=>operation(async()=>{
      const result:{rootActivityId:string;revision:number;mode:import('@/lib/activities/subitems').SelectionMode;item:import('@/lib/activities/subitems').ActivitySubitem}[]=[];
      const revisions=new Map<string,number>();
      for(let offset=0;;offset+=PAGE_SIZE){
        const {data,error}=await client.rpc('list_activity_subitems',{p_offset:offset});
        if(error)throw error;if(!Array.isArray(data))fail('subitems');
        for(const value of data){const row=record(value,'subitem'),rootActivityId=uuid(row.root_activity_id),revision=integer(row.root_revision,'revision',1);
          if(revisions.has(rootActivityId)&&revisions.get(rootActivityId)!==revision)throw new PersistenceError('Conflict');revisions.set(rootActivityId,revision);
          result.push({rootActivityId,revision,mode:choice(row.child_selection_mode,['all','none','custom'] as const,'mode'),item:{id:uuid(row.id),parentId:row.parent_id as string|null,name:row.name as string,durationMinutes:row.duration_minutes as number,sortOrder:row.sort_order as number,active:row.active as boolean,defaultSelected:row.default_selected as boolean}});
        }
        if(data.length<PAGE_SIZE)return result;
      }
    }),
    listActivities:()=>operation(async()=>{
      const result:PersistedActivitySummary[]=[];
      for(let offset=0;;offset+=PAGE_SIZE) {
        const {data,error}=await client.from('activities').select(ACTIVITY_LIST_COLUMNS)
          .order('updated_at',{ascending:false}).order('id',{ascending:true}).range(offset,offset+PAGE_SIZE-1);
        if(error) throw error;
        if(!Array.isArray(data)) fail('activities.response');
        result.push(...data.map(activitySummaryFromDatabase));
        if(data.length < PAGE_SIZE) return result;
      }
    }),
    listAreas:()=>operation(async()=>{
      const result:Area[]=[];
      for(let offset=0;;offset+=PAGE_SIZE) {
        const {data,error}=await client.from('areas').select(AREA_LIST_COLUMNS)
          .order('sort_position',{ascending:true}).order('id',{ascending:true}).range(offset,offset+PAGE_SIZE-1);
        if(error) throw error;
        if(!Array.isArray(data)) fail('areas.response');
        result.push(...data.map(areaFromDatabase));
        if(data.length < PAGE_SIZE) return result;
      }
    }),
    getActivity:id=>operation(async()=>{
      const {data,error}=await client.rpc('get_activity_aggregate',{p_activity_id:uuid(id)});
      if(error) throw error;
      if(data === null) throw new PersistenceError('NotFound');
      return aggregateFromDatabase(data);
    }),
    saveActivity:(bundle,expectedRevision,deletedSubitemIds=[])=>operation(async()=>{
      const args=aggregateToRpc(bundle,expectedRevision);
      const deletions=deletedSubitemIds.length?validateSubitemDeletions(deletedSubitemIds,validateTree(bundle.subitems)):[];
      if(deletions.length&&expectedRevision===undefined)fail('expectedRevision');
      const {data,error}=(bundle.checklistItems!==undefined||bundle.trackingMode!==undefined)?await client.rpc('save_activity_v05',{
        ...args,p_relations:args.p_relations??{},p_expected_revision:expectedRevision??null,p_tree:bundle.subitems===undefined?null:validateTree(bundle.subitems) as unknown as Json,
        p_deleted_ids:deletions,p_checklist:checklistItems(bundle.checklistItems??[]) as unknown as Json,
      }):deletions.length?await client.rpc('save_activity_with_subitem_deletions',{
        ...args,p_relations:args.p_relations??{},p_expected_revision:expectedRevision!,p_tree:validateTree(bundle.subitems) as unknown as Json,p_deleted_ids:deletions,
      }):bundle.subitems===undefined?await client.rpc('save_activity_aggregate',args):await client.rpc('save_activity_with_subitems',{
        ...args,p_relations:args.p_relations??{},p_expected_revision:expectedRevision??null,p_tree:validateTree(bundle.subitems) as unknown as Json,
      });
      if(error) throw error;
      return aggregateFromDatabase(data);
    }),
  };
}
