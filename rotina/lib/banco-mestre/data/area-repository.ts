import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { AreaRepository, AreaSnapshot, ManagedArea } from './area-contracts';
import { managedAreaFromDatabase } from './area-mapper';
import { createAreaInput, renameAreaInput, setAreaActiveInput } from './area-validation';
import { AREA_LIST_COLUMNS } from './repository';
import { PersistenceError, toPersistenceError } from './errors';
import { fail, record, uuid } from './validation';

type AreaClient = Pick<SupabaseClient<Database>, 'from'>;
const PAGE_SIZE=500;
/** Server-side dependency: verifiedUserId must come from verified session context,
 * never a browser DTO. This factory does not authenticate; RLS remains mandatory.
 * No global client, service credentials, upsert, DELETE or sort_position writes.
 */
export function createAreaRepository(client: AreaClient, verifiedUserId: string): AreaRepository {
  let owner: string;
  try {owner=uuid(verifiedUserId,'verifiedUserId');}
  catch(error) {throw new PersistenceError('Unauthorized',error);}
  async function operation<T>(fn:()=>Promise<T>):Promise<T> {
    try {return await fn();} catch(error) {throw toPersistenceError(error);}
  }
  function rows(value: unknown): ManagedArea[] {
    if(!Array.isArray(value)) fail('areas.response');
    return value.map(row=>{
      if(uuid(record(row,'area').user_id,'area.user_id')!==owner) fail('area.owner');
      return managedAreaFromDatabase(row);
    });
  }
  async function update(id: string, expected: AreaSnapshot, patch: {name: string}|{active: boolean}):Promise<ManagedArea> {
    const {data,error}=await client.from('areas').update(patch)
      .eq('id',id).eq('user_id',owner).eq('name',expected.name).eq('active',expected.active)
      .eq('sort_position',expected.sortPosition).eq('updated_at',expected.updatedAt).select(AREA_LIST_COLUMNS);
    if(error) throw error;
    const changed=rows(data);
    if(changed.length===1) return changed[0];
    if(changed.length!==0) fail('areas.update');
    // This read only classifies the failed conditional UPDATE. Never retry it.
    const visible=await client.from('areas').select('id').eq('id',id).eq('user_id',owner).limit(1);
    if(visible.error) throw visible.error;
    if(!Array.isArray(visible.data)) fail('areas.available');
    if(visible.data.length===0) throw new PersistenceError('NotFound');
    if(visible.data.length!==1 || uuid(record(visible.data[0],'area').id)!==id) fail('areas.available');
    throw new PersistenceError('Conflict');
  }
  return {
    listManagedAreas:()=>operation(async()=>{
      const result:ManagedArea[]=[];
      for(let offset=0;;offset+=PAGE_SIZE) {
        const {data,error}=await client.from('areas').select(AREA_LIST_COLUMNS).eq('user_id',owner)
          .order('sort_position',{ascending:true}).order('id',{ascending:true}).range(offset,offset+PAGE_SIZE-1);
        if(error) throw error;
        const page=rows(data);result.push(...page);
        if(page.length<PAGE_SIZE) return result;
      }
    }),
    createArea:input=>operation(async()=>{
      const value=createAreaInput(input);
      const {data,error}=await client.from('areas').insert({id:value.id,user_id:owner,name:value.name}).select(AREA_LIST_COLUMNS);
      if(error) {
        if(error.code==='23505') throw new PersistenceError('Conflict',error);
        throw error;
      }
      const created=rows(data);
      if(created.length!==1 || created[0].id!==value.id) fail('areas.create');
      return created[0];
    }),
    renameArea:input=>operation(async()=>{
      const value=renameAreaInput(input);
      return update(value.id,value.expected,{name:value.name});
    }),
    setAreaActive:input=>operation(async()=>{
      const value=setAreaActiveInput(input);
      return update(value.id,value.expected,{active:value.active});
    }),
  };
}
