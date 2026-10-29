/* eslint-disable @typescript-eslint/no-require-imports -- Local synthetic read-only measurements, no credentials. */
const {performance}=require('node:perf_hooks');
const {withStubs}=require('./load-with-stubs.cjs');
const {load}=require('./load-typescript.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function readProbes({projectFile='lib/projects/server.ts',financeFile='app/financas/page.tsx'}={}) {
  const latency=40,calls=[];
  const project=withStubs(projectFile,{
    '@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:'fixture'}},error:null})}})},
    '@/lib/banco-mestre/data/errors':load('lib/banco-mestre/data/errors.ts'),
    '@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
    './repository':{createProjectRepository:()=>({get:async()=>{calls.push('project');await pause(latency);return {};},tasks:async()=>{calls.push('tasks');await pause(latency);return [];}})},
  });
  let start=performance.now();await project.readProject('fixture');const projectDetailMs=performance.now()-start;
  const finance=withStubs(financeFile,{
    '@/lib/finance/server':{readFinance:async()=>{await pause(latency);return {status:'ready',month:'2026-10',transactions:[]};}},
    '@/components/finance/FinanceOverview':{FinanceOverview:'overview'},
    '@/components/finance/FinanceReadError':{FinanceReadError:'error'},
    '@/lib/finance/bills-server':{readBills:async()=>{await pause(2*latency);return {status:'ready',month:'2026-10',currentMonth:'2026-10',items:[],definitions:[]};}},
    '@/components/finance/BillsSection':{BillsSection:'bills'},
  });
  const page=finance.default({searchParams:Promise.resolve({})}).props.children;
  start=performance.now();await page.type(page.props);const financePrimaryMs=performance.now()-start;
  await pause(2*latency); // Finish pending synthetic work before releasing the harness.
  return {latencyPerQueryMs:latency,projectDetailMs:Math.round(projectDetailMs),financePrimaryMs:Math.round(financePrimaryMs),projectCalls:calls.length};
}
async function httpProbes(origin,routes=['/hoje','/planejamento','/calendario','/projetos','/banco-mestre','/ideias','/financas','/conta']) {
  const results=[];
  for(const route of routes) {
    const times=[];let status;
    for(let i=0;i<4;i++){const start=performance.now();const r=await fetch(origin+route,{redirect:'manual'});await r.arrayBuffer();status=r.status;if(i)times.push(performance.now()-start);}
    times.sort((a,b)=>a-b);results.push({route,status,medianMs:Math.round(times[1])});
  }
  return results;
}
async function taskPayloadProbe() {
  const {randomUUID}=require('node:crypto'),owner=randomUUID(),project=randomUUID();
  const records=Array.from({length:1000},()=>({id:randomUUID(),user_id:owner,project_id:project,title:'T'.repeat(200),completed_at:null,created_at:'2026-10-28T12:00:00Z',updated_at:'2026-10-28T12:00:00Z'}));
  let bytes=0,queries=0;
  const client={from(){let columns,offset=0,end=499;const q={select(c){columns=c.split(',');return q;},eq(){return q;},order(){return q;},range(a,b){offset=a;end=b;return q;},then(resolve){const data=records.slice(offset,end+1).map(row=>Object.fromEntries(columns.map(k=>[k,row[k]])));bytes+=Buffer.byteLength(JSON.stringify(data));queries++;resolve({data,error:null});}};return q;}};
  const repo=load('lib/projects/repository.ts').createProjectRepository(client,owner);
  const rows=await (repo.taskProgress?repo.taskProgress():repo.tasks());
  return {tasks:rows.length,queries,bytes};
}
module.exports={readProbes,httpProbes,taskPayloadProbe};
