// Test-only PostgREST-shaped adapter over a disposable real PGlite schema.
// Only the local synthetic identity is used; no credentials or remote DB URL.
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {authFixture,A} from '../helpers/account-fixtures.mjs';

export async function createV05LocalApi(){
  const db=new PGlite();await db.exec(authFixture);await db.query('insert into auth.users(id) values($1)',[A]);
  for(const f of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);await db.exec('set role authenticated');
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
  const later=offset=>{const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10);};
  const area=randomUUID();let activityId=randomUUID(),definition=['Escovar dentes','Skincare','Separar roupa','Preparar mochila'].map(label=>({id:randomUUID(),label}));
  await db.query("insert into areas(id,user_id,name) values($1,$2,'Área local')",[area,A]);
  await db.query('select save_activity_v05($1,$2,null,null,$3::uuid[],$4)',[JSON.stringify({id:activityId,area_id:area,name:'Rotina noturna local',type:'checklistGoal'}),'{}',[],JSON.stringify(definition)]);
  for(let i=0;i<4;i++){const id=randomUUID();await db.query("select save_activity_aggregate($1,'{}',null)",[JSON.stringify({id,area_id:area,name:'Normal local '+i,type:'variableActivity'})]);await db.query('select create_daily_plan_v05($1,$2,$3,$4,null,null)',[randomUUID(),id,date,i===0?'10:30':null]);}
  const json=v=>v==null?null:JSON.stringify(v);
  const rpc={
    list_activity_subitems:a=>['select list_activity_subitems($1) v',[a.p_offset??0]],
    get_activity_aggregate:a=>['select get_activity_aggregate($1) v',[a.p_activity_id]],
    save_activity_v05:a=>['select save_activity_v05($1,$2,$3,$4,$5::uuid[],$6) v',[json(a.p_activity),json(a.p_relations),a.p_expected_revision,json(a.p_tree),a.p_deleted_ids,json(a.p_checklist)]],
    save_activity_aggregate:a=>['select save_activity_aggregate($1,$2,$3) v',[json(a.p_activity),json(a.p_relations),a.p_expected_revision??null]],
    create_daily_plan_v05:a=>['select create_daily_plan_v05($1,$2,$3,$4,$5,$6) v',[a.p_id,a.p_activity_id,a.p_planned_date,a.p_planned_time,a.p_revision,json(a.p_configuration)]],
    change_daily_plan_v05:a=>['select change_daily_plan_v05($1,$2,$3,$4) v',[a.p_id,json(a.p_expected),a.p_operation,json(a.p_value)]],
    reorder_plan_day:a=>['select reorder_plan_day($1,$2) v',[a.p_date,json(a.p_items)]],
  };
  const allowedTables=new Set(['activities','areas','daily_plan_items','financial_transactions','fixed_expenses','fixed_expense_months']);
  const ident=s=>{assert(/^[a-z_]+$/.test(s));return s;};
  async function handle(req,res){
    try{
      const url=new URL(req.url,'http://127.0.0.1');const route=url.pathname.split('/').filter(Boolean);
      if(route[0]!=='rest')return false;
      let data;
      const body=async()=>{let text='';for await(const chunk of req)text+=chunk;return text?JSON.parse(text):{};};
      if(route[2]==='rpc'){
        const name=route[3];if(!rpc[name])data=[];
        else {const [sql,values]=rpc[name](await body());data=(await db.query(sql,values)).rows[0].v;}
      }else{
        const table=route[2];if(!allowedTables.has(table)){data=[];}
        else{
          const columns=(url.searchParams.get('select')??'*').split(',').map(n=>n==='*'?'*':ident(n)).join(',');
          const values=[],clauses=[];const param=value=>{values.push(value);return '$'+values.length;};
          for(const [key,value] of url.searchParams){if(['select','order','limit','offset'].includes(key))continue;const dot=value.indexOf('.'),op=value.slice(0,dot),literal=value.slice(dot+1);
            if(op==='is'&&literal==='null')clauses.push(ident(key)+' is null');else{assert(['eq','lt','lte','gt','gte'].includes(op));clauses.push(ident(key)+({eq:'=',lt:'<',lte:'<=',gt:'>',gte:'>='}[op])+param(literal));}
          }
          const where=clauses.length?' where '+clauses.join(' and '):'';
          let sql;
          if(req.method==='PATCH'){
            const payload=await body();assert(table==='daily_plan_items');assert(Object.keys(payload).every(k=>['completed_at','planned_date'].includes(k)));
            sql='update '+table+' set '+Object.entries(payload).map(([key,value])=>ident(key)+'='+param(value)).join(',')+where+' returning '+columns;
            sql='with q as ('+sql+') select coalesce(jsonb_agg(to_jsonb(q)),\'[]\'::jsonb) v from q';
          }else{
            assert(req.method==='GET');const orders=(url.searchParams.get('order')??'id.asc').split(',').map(value=>{const [key,dir]=value.split('.');assert(['asc','desc'].includes(dir));return ident(key)+' '+dir;}).join(',');
            const range=String(req.headers.range??'').match(/^(\d+)-(\d+)$/),limit=range?Number(range[2])-Number(range[1])+1:Number(url.searchParams.get('limit')??500),offset=range?Number(range[1]):Number(url.searchParams.get('offset')??0);
            assert(Number.isInteger(limit)&&limit>0&&limit<=1000&&Number.isInteger(offset)&&offset>=0);
            sql='select coalesce(jsonb_agg(to_jsonb(q)),\'[]\'::jsonb) v from (select '+columns+' from '+table+where+' order by '+orders+' limit '+param(limit)+' offset '+param(offset)+') q';
          }
          data=(await db.query(sql,values)).rows[0].v;
        }
      }
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return true;
    }catch(error){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({code:error.code??'LOCAL_TEST',message:'Local test persistence failure'}));console.error('Local API failure',error.code??error.name);return true;}
  }
  return {handle,areaId:area,get activityId(){return activityId;},date,nextDate:later(1),futureDate:later(2),get definition(){return definition;},
    async seedOpenChecklist(){
      const id=randomUUID(),items=['Smoke A','Smoke B'].map(label=>({id:randomUUID(),label}));
      await db.query("select save_activity_v05($1,'{}',null,null,'{}'::uuid[],$2)",[JSON.stringify({id,area_id:area,name:'Merge smoke',type:'checklistGoal',goal_tracking_mode:'checklist'}),JSON.stringify(items)]);
      const p=(await db.query('select create_daily_plan_v05($1,$2,$3,null,null,null) v',[randomUUID(),id,date])).rows[0].v;
      await db.query("select change_daily_plan_v05($1,$2,'check',$3)",[p.id,JSON.stringify({plannedDate:p.planned_date,completedAt:null,updatedAt:p.updated_at}),JSON.stringify({id:items[0].id,completed:true})]);
      return id;
    },
    async seedVolume(){
      for(let i=0;i<20;i++){
        const id=randomUUID(),checks=i%4===1?[{id:randomUUID(),label:'Volume check'}]:[];
        const goal=i%4===2?{goals:[{id:randomUUID(),metric:'count',unit:'execution',minimum_target:1,period:'day',enabled:true,starts_on:later(-2),sort_position:0}]}:{};
        const tree=i%4===3?{mode:'all',items:[{id:randomUUID(),parentId:null,name:'Volume leaf',durationMinutes:5,sortOrder:0,active:true,defaultSelected:true}]}:null;
        const saved=(await db.query('select save_activity_v05($1,$2,null,$3,$4::uuid[],$5) v',[JSON.stringify({id,area_id:area,name:'Volume smoke '+String(i).padStart(2,'0'),type:i%4===1||i%4===2?'checklistGoal':'variableActivity',goal_tracking_mode:i%4===2?'quantity':'checklist'}),JSON.stringify(goal),json(tree),[],JSON.stringify(checks)])).rows[0].v;
        await db.query('select create_daily_plan_v05($1,$2,$3,null,$4,$5) v',[randomUUID(),id,i===0?later(-1):date,saved.activity.revision,json(tree?tree.items.map(n=>({id:n.id,selected:true,overrideMinutes:null})):null)]);
      }
    },
    async trackActivity(id){assert(/^[0-9a-f-]{36}$/.test(id));const row=(await db.query('select checklist_items from activities where id=$1',[id])).rows[0];assert(row);activityId=id;definition=row.checklist_items;},
    async removeTrackedPlans(){await db.exec('reset role');try{await db.query('delete from daily_plan_items where activity_id=$1 and user_id=$2',[activityId,A]);}finally{await db.exec('set role authenticated');}},
    async inspect(){return {template:(await db.query('select checklist_items from activities where id=$1',[activityId])).rows[0].checklist_items,
      numericGoals:Number((await db.query('select count(*) n from goals where activity_id=$1',[activityId])).rows[0].n),
      plans:(await db.query('select coalesce(jsonb_agg(to_jsonb(d)),\'[]\'::jsonb) v from daily_plan_items d where activity_id=$1',[activityId])).rows[0].v};},
    close:()=>db.close()};
}
