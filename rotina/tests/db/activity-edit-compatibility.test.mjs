import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {authFixture,A} from '../helpers/account-fixtures.mjs';
import {pgliteClient} from '../helpers/pglite-client.mjs';
const require=createRequire(import.meta.url),{load}=require('../helpers/load-typescript.cjs');

test('Development schema through V0.4: normal edits work without deletion migration; missing RPC is diagnosed without partial writes',async()=>{
  const db=new PGlite();
  try{
    await db.exec(authFixture);await db.query('insert into auth.users(id) values($1)',[A]);
    for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<'20261031000300').sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);await db.exec('set role authenticated');
    const repo=load('lib/banco-mestre/data/repository.ts').createBancoMestreRepository(pgliteClient(db,['activities','areas','activity_subitems']));
    const {createDraft,buildBundle}=load('lib/banco-mestre/editor.ts');
    const {saveBancoMestreActivity}=load('lib/banco-mestre/data/write-model.ts');
    for(const mode of ['all','none','custom']){
      const area=randomUUID(),id=randomUUID();await db.query("insert into areas(id,user_id,name) values($1,$2,'Area')",[area,A]);
      const leaf={id:randomUUID(),parentId:null,name:'Private activity content',durationMinutes:15,sortOrder:0,active:true,defaultSelected:true};
      const tree={mode,items:[leaf]};
      await db.query("select save_activity_with_subitems($1,'{}',null,$2)",[JSON.stringify({id,area_id:area,name:'Private name',type:'variableActivity'}),JSON.stringify(tree)]);
      let saved=await repo.getActivity(id);
      const request=(change,deletedSubitemIds)=>{
        const draft=createDraft(saved.bundle),next=structuredClone(saved.bundle.subitems);
        change(draft,next);
        const built=buildBundle(draft,[{id:area,name:'Area',active:true}],id,'2026-11-01T12:00:00Z',saved.bundle.activity);assert(built.ok);
        built.bundle.subitems=next;
        return {mode:'edit',bundle:built.bundle,expectedRevision:saved.revision,...(deletedSubitemIds?{deletedSubitemIds}:{})};
      };
      for(const change of [
        draft=>{draft.name='Mother edited';},
        (_draft,next)=>{next.items[0].name='Leaf edited';next.items[0].durationMinutes=25;},
        (_draft,next)=>{next.items.push({...leaf,id:randomUUID(),name:'Added leaf'});},
        (_draft,next)=>{next.items[0].defaultSelected=false;},
      ]){
        const result=await saveBancoMestreActivity(async()=>repo,request(change));assert.equal(result.ok,true,mode);
        saved=await repo.getActivity(id);
      }
      const before=structuredClone(saved),input=request((_draft,next)=>{next.items=next.items.filter(n=>n.id!==leaf.id);},[leaf.id]);
      let sqlError;
      const result=await saveBancoMestreActivity(async()=>({saveActivity:async(...args)=>{
        try{return await repo.saveActivity(...args);}catch(error){sqlError=error;throw error;}
      }}),input);
      assert.equal(sqlError.cause.code,'42883');
      assert.equal(result.ok,false);assert.equal(result.kind,'Unknown');
      assert.match(result.message,/atualização do banco/);assert(!JSON.stringify(result).includes('42883'));
      assert.deepEqual(await repo.getActivity(id),before,'missing RPC must not update the aggregate or tree');
    }
    const area=randomUUID(),id=randomUUID();await db.query("insert into areas(id,user_id,name) values($1,$2,'Area')",[area,A]);
    await db.query("select save_activity_aggregate($1,'{}',null)",[JSON.stringify({id,area_id:area,name:'Legacy',type:'variableActivity'})]);
    const legacy=await repo.getActivity(id);assert.equal(legacy.bundle.subitems,undefined);
    const result=await saveBancoMestreActivity(async()=>repo,{mode:'edit',bundle:{...legacy.bundle,activity:{...legacy.bundle.activity,name:'Legacy edited',description:'Description',duration:{mode:'fixed',minutes:42}}},expectedRevision:legacy.revision});
    assert(result.ok);assert.equal((await repo.getActivity(id)).bundle.activity.duration.minutes,42);
  }finally{await db.close();}
});
