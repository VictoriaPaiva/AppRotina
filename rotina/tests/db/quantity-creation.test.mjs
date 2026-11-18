import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {authFixture,A} from '../helpers/account-fixtures.mjs';
import {pgliteClient} from '../helpers/pglite-client.mjs';
const {load}=createRequire(import.meta.url)('../helpers/load-typescript.cjs');
test('Beber água: actual draft -> mapper -> write boundary -> repository -> V0.5 RPC; create/edit matrix',async()=>{
 const db=new PGlite();try{
 await db.exec(authFixture);await db.query('insert into auth.users(id) values($1)',[A]);
 for(const f of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);await db.exec('set role authenticated');
 const area=randomUUID();await db.query("insert into areas(id,user_id,name) values($1,$2,'Saúde')",[area,A]);
 const repository=load('lib/banco-mestre/data/repository.ts').createBancoMestreRepository(pgliteClient(db,['activities','areas']));
 const {createDraft,buildBundle}=load('lib/banco-mestre/editor.ts');
 const {saveBancoMestreActivity}=load('lib/banco-mestre/data/write-model.ts');
 for(const metric of ['count','quantity'])for(const period of ['day','week','month'])for(const ideal of ['','5']){
 const id=randomUUID(),draft={...createDraft(),name:'Beber água',areaId:area,type:'checklistGoal',goals:[{id:randomUUID(),enabled:true,metric,unit:metric==='count'?'execution':'garrafas',minimum:'3',ideal,minimumHours:'',idealHours:'',period,startsOn:'2026-11-18',endsOn:''}]};
 for(const mode of ['create','edit']){
 const prior=mode==='edit'?await repository.getActivity(id):undefined;
 const built=buildBundle(prior?createDraft(prior.bundle):draft,[{id:area,name:'Saúde',active:true}],id,new Date().toISOString(),prior?.bundle.activity);
 assert.equal(built.ok,true);built.bundle.trackingMode='quantity';built.bundle.checklistItems=[];
 const result=await saveBancoMestreActivity(async()=>repository,mode==='create'?{mode,bundle:built.bundle}:{mode,bundle:built.bundle,expectedRevision:prior.revision});
 assert.equal(result.ok,true,JSON.stringify({metric,period,ideal,mode,result}));
 const saved=await repository.getActivity(id);assert.equal(saved.bundle.goals[0].minimumTarget,3);assert.equal(saved.bundle.goals[0].idealTarget,ideal?5:undefined);assert.equal(saved.bundle.activity.duration.mode,'unknown');
 }
 }
 }finally{await db.close();}
});
