import type { SupabaseClient } from '@supabase/supabase-js';
import type { Area } from '@/types/banco-mestre';
import type { Database } from './database.types';
import type { BancoMestreRepository, PersistedActivitySummary } from './contracts';
import { aggregateFromDatabase, aggregateToRpc, activitySummaryFromDatabase, areaFromDatabase } from './mapper';
import { PersistenceError, toPersistenceError } from './errors';
import { fail, uuid } from './validation';

export type BancoMestreClient = Pick<SupabaseClient<Database>, 'from' | 'rpc'>;
export const ACTIVITY_LIST_COLUMNS = 'id,user_id,name,description,area_id,status,type,default_importance,duration_mode,duration_minutes,min_duration_minutes,ideal_duration_minutes,revision,created_at,updated_at';
export const AREA_LIST_COLUMNS = 'id,user_id,name,active,sort_position,created_at,updated_at';
const PAGE_SIZE=500;
/** Dependência por instância: funciona com as factories browser/server, sem singleton/sessão global. */
export function createBancoMestreRepository(client: BancoMestreClient): BancoMestreRepository {
  const operation=async <T>(fn:()=>Promise<T>):Promise<T>=>{
    try { return await fn(); } catch(error) { throw toPersistenceError(error); }
  };
  return {
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
    saveActivity:(bundle,expectedRevision)=>operation(async()=>{
      const args=aggregateToRpc(bundle,expectedRevision);
      const {data,error}=await client.rpc('save_activity_aggregate',args);
      if(error) throw error;
      return aggregateFromDatabase(data);
    }),
  };
}
