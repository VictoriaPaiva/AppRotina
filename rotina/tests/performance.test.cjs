/* eslint-disable @typescript-eslint/no-require-imports -- Concurrency/streaming regressions without live data. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {withStubs}=require('./helpers/load-with-stubs.cjs'),{load}=require('./helpers/load-typescript.cjs');
const {taskPayloadProbe}=require('./helpers/performance-probes.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {resolve,promise};};
test('project detail starts independent reads together, retains errors and does not fetch unrelated task details in list',async()=>{
  const first=deferred(),second=deferred(),calls=[];
  const stubs={
    '@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:'fixture'}},error:null})}})},
    '@/lib/banco-mestre/data/errors':load('lib/banco-mestre/data/errors.ts'),
    '@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
    './repository':{createProjectRepository:()=>({get:()=>{calls.push('project');return first.promise;},tasks:()=>{calls.push('tasks');return second.promise;},list:async()=>[],taskProgress:async()=>{calls.push('progress');return [];}})},
  };
  const server=withStubs('lib/projects/server.ts',stubs),pending=server.readProject('fixture');
  await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['project','tasks']);
  first.resolve({id:'fixture'});second.resolve([]);assert.equal((await pending).status,'ready');
  calls.length=0;await server.readProjects();assert.deepEqual(calls,['progress']);
});
test('project progress projection paginates 1000 tasks with hierarchy/stages/weights without full text',async()=>{
  const result=await taskPayloadProbe();assert.equal(result.tasks,1000);assert.equal(result.queries,3);assert(result.bytes<270000);
});
test('linear project grouping preserves 0/partial/100 percentages and separates projects',()=>{
  const {projectProgressById}=load('lib/projects/progress.ts');
  const result=projectProgressById([{projectId:'a',completedAt:null},{projectId:'a',completedAt:'paid'},{projectId:'b',completedAt:'paid'}]);
  assert.deepEqual(result.get('a'),{completed:1,total:2,percentage:50});assert.equal(result.get('b').percentage,100);assert.equal(result.get('empty'),undefined);assert.equal(projectProgressById([]).size,0);
});
test('finance renders primary summary without waiting for bills; bill errors remain local to its Suspense',async()=>{
  const bills=deferred();let started=false;
  const {default:Page}=withStubs('app/financas/page.tsx',{
    '@/lib/finance/server':{readFinance:async()=>({status:'ready',month:'2026-10',transactions:[]})},
    '@/components/finance/FinanceOverview':{FinanceOverview:'overview'},'@/components/finance/FinanceReadError':{FinanceReadError:'error'},
    '@/lib/finance/bills-server':{readBills:()=>{started=true;return bills.promise;}},'@/components/finance/BillsSection':{BillsSection:'bills'},
  });
  const content=Page({searchParams:Promise.resolve({})}).props.children;
  const result=await Promise.race([content.type(content.props),new Promise((_,reject)=>setTimeout(()=>reject(Error('primary content blocked by bills')),1000))]);
  assert(started);assert.equal(result.type,'overview');assert.equal(result.props.month,'2026-10');
  const boundary=result.props.children;assert.equal(boundary.props.fallback.props.role,'status');
  bills.resolve({status:'error',kind:'Unknown',message:'Safe'});
  const section=boundary.props.children;assert.equal((await section.type(section.props)).type,'error');
});
