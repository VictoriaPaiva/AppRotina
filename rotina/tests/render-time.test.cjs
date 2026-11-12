/* eslint-disable @typescript-eslint/no-require-imports -- Offline server rendering regression. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {withStubs}=require('./helpers/load-with-stubs.cjs');
const {load}=require('./helpers/load-typescript.cjs');
const {renderToStaticMarkup}=require('react-dom/server');

function sessionBoundary() {
  let release,connected=false;
  const calls=[];
  const gate=new Promise(resolve=>{release=()=>{connected=true;resolve();};});
  const {createClient}=withStubs('lib/supabase/server.ts',{
    'next/server':{connection:()=>{calls.push('connection');return gate;}},
    'next/headers':{cookies:async()=>{assert(connected);calls.push('cookies');return {getAll:()=>[],set(){}};}},
    './configuration':{requireSupabasePublicConfig:()=>({url:'https://example.supabase.co',key:'fixture'})},
    '@supabase/ssr':{createServerClient:()=>{
      assert(connected,'SDK clock must never run during prerender');
      Date.now();calls.push('sdk');
      return {auth:{getClaims:async()=>({data:{claims:{sub:'owner'}},error:null})}};
    }},
  });
  return {createClient,release,calls,assertClock(){assert(connected,'civil date must be read at request time');return '2026-10-31';}};
}
const readFailure=error=>{throw error;};
const {PersistenceError}=load('lib/banco-mestre/data/errors.ts');

test('server client waits for a real request before cookies and SDK time reads',async()=>{
  const h=sessionBoundary(),pending=h.createClient();
  await Promise.resolve();assert.deepEqual(h.calls,['connection']);
  h.release();await pending;assert.deepEqual(h.calls,['connection','cookies','sdk']);
});

test('/hoje content waits before reading today and renders the planning board',async()=>{
  const h=sessionBoundary(),dates=load('lib/planning/dates.ts');
  const {readPlanPage}=withStubs('lib/planning/server.ts',{
    '@/lib/supabase/server':h,
    '@/lib/banco-mestre/data/repository':{createBancoMestreRepository:()=>({listActivities:async()=>[],listSubitems:async()=>[]})},
    '@/lib/banco-mestre/data/read-model':{readFailure},
    '@/lib/banco-mestre/data/errors':{PersistenceError},
    '@/lib/banco-mestre/data/validation':load('lib/banco-mestre/data/validation.ts'),
    './repository':{createPlanRepository:()=>({listByDate:async()=>[],listPending:async()=>[],listCompletedOn:async()=>[]})},
    './dates':{...dates,planToday:()=>h.assertClock()},
  });
  const {PlanPageContent}=withStubs('components/planning/PlanPageContent.tsx',{
    '@/lib/planning/server':{readPlanPage},'./PlanningBoard':{PlanningBoard:({data})=>data.today},
  });
  const pending=PlanPageContent({todayMode:true});
  await Promise.resolve();assert.deepEqual(h.calls,['connection']);
  h.release();assert.equal(renderToStaticMarkup(await pending),'2026-10-31');
});

test('/banco-mestre reader waits before SDK initialization without a business clock',async()=>{
  const h=sessionBoundary();
  const {createBancoMestreReader}=withStubs('lib/banco-mestre/data/server-reader.ts',{
    '@/lib/supabase/server':h,
    './repository':{createBancoMestreRepository:()=>({listAreas:async()=>[],listActivities:async()=>[]})},
  });
  const {readBancoMestreList}=load('lib/banco-mestre/data/read-model.ts');
  const pending=readBancoMestreList(createBancoMestreReader);
  await Promise.resolve();assert.deepEqual(h.calls,['connection']);
  h.release();assert.deepEqual(await pending,{status:'ready',areas:[],activities:[]});
});

test('calendar waits before reading the current civil date',async()=>{
  const h=sessionBoundary();
  const {readCalendarPage}=withStubs('lib/planning/calendar-server.ts',{
    '@/lib/supabase/server':h,
    '@/lib/banco-mestre/data/repository':{createBancoMestreRepository:()=>({listActivities:async()=>[],listAreas:async()=>[]})},
    '@/lib/banco-mestre/data/read-model':{readFailure},
    '@/lib/banco-mestre/data/errors':{PersistenceError},
    '@/lib/banco-mestre/data/validation':load('lib/banco-mestre/data/validation.ts'),
    './repository':{createPlanRepository:()=>({listByRange:async()=>[]})},
    './dates':{planToday:()=>h.assertClock()},
    './calendar':load('lib/planning/calendar.ts'),
  });
  const pending=readCalendarPage();
  await Promise.resolve();assert.deepEqual(h.calls,['connection']);
  h.release();assert.equal((await pending).today,'2026-10-31');
});

for(const bills of [false,true])test(`${bills?'fixed bills':'transactions'} reads the current month only after the session boundary`,async()=>{
  const h=sessionBoundary();
  const stubs={
    '@/lib/supabase/server':h,
    '@/lib/banco-mestre/data/errors':{PersistenceError},
    '@/lib/banco-mestre/data/read-model':{readFailure},
    '@/lib/planning/dates':{planToday:()=>h.assertClock()},
    './validation':load('lib/finance/validation.ts'),
  };
  if(bills){
    stubs['./bills']=load('lib/finance/bills.ts');
    stubs['./bills-repository']={createBillsRepository:()=>({initialize:async()=>{},month:async()=>[],definitions:async()=>[]})};
  }else stubs['./repository']={createFinanceRepository:()=>({list:async()=>[]})};
  const server=withStubs(bills?'lib/finance/bills-server.ts':'lib/finance/server.ts',stubs);
  const pending=bills?server.readBills():server.readFinance();
  await Promise.resolve();assert.deepEqual(h.calls,['connection']);
  h.release();assert.equal((await pending).month,'2026-10');
});

test('civil date respects Sao Paulo midnight, year rollover and historical DST',()=>{
  const {planToday}=load('lib/planning/dates.ts');
  for(const [instant,expected] of [
    ['2026-11-01T02:59:59.999Z','2026-10-31'],['2026-11-01T03:00:00Z','2026-11-01'],
    ['2027-01-01T02:59:59Z','2026-12-31'],['2018-12-01T01:59:59Z','2018-11-30'],
    ['2018-12-01T02:00:00Z','2018-12-01'],
  ])assert.equal(planToday(new Date(instant)),expected);
});

test('audited production source has no new direct current-time readers',()=>{
  const root=path.resolve(__dirname,'..');
  const readers=[];
  function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())visit(file);
    else if(/\.[jt]sx?$/.test(file)){
      let clock=false;
      const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
      function walk(node){
        if(ts.isNewExpression(node)&&node.expression.getText(source)==='Date'&&!node.arguments?.length)clock=true;
        if(ts.isCallExpression(node)&&node.expression.getText(source)==='Date.now')clock=true;
        ts.forEachChild(node,walk);
      }
      walk(source);if(clock)readers.push(path.relative(root,file).replaceAll('\\','/'));
    }
  }}
  for(const dir of ['app','components','lib'])visit(path.join(root,dir));
  assert.deepEqual(readers.sort(),[
    'components/banco-mestre/ActivityForm.tsx', // only add-rule/submit event handlers
    'lib/banco-mestre/data/rls-smoke.ts', // explicit development route execution
    'lib/banco-mestre/data/smoke.ts',
    'lib/dev-cleanup/confirmation.ts', // request handler token expiry
    'lib/planning/dates.ts', // callers await the session/request boundary
  ].sort());
  const config=fs.readFileSync(path.join(root,'next.config.ts'),'utf8');
  assert.match(config,/cacheComponents:\s*true/);assert.match(config,/partialPrefetching:\s*true/);
});
