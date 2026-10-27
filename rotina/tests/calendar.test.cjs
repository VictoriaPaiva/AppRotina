/* eslint-disable @typescript-eslint/no-require-imports -- Offline harness. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {load}=require('./helpers/load-typescript.cjs'),{withStubs}=require('./helpers/load-with-stubs.cjs');
const {calendarMonth}=load('lib/planning/calendar.ts');
test('calendar server authenticates and batches inactive names/areas for selected month',async()=>{
  const calls=[];
  const stubs={
    '@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:'owner'}}})}})},
    '@/lib/banco-mestre/data/repository':{createBancoMestreRepository:()=>({listActivities:async()=>[{activity:{id:'a',name:'Real',status:'inactive',areaId:'area'}}],listAreas:async()=>[{id:'area',name:'Saúde'}]})},
    '@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
    '@/lib/banco-mestre/data/errors':load('lib/banco-mestre/data/errors.ts'),
    '@/lib/banco-mestre/data/validation':load('lib/banco-mestre/data/validation.ts'),
    './repository':{createPlanRepository:(_client,owner)=>{assert.equal(owner,'owner');return {listByRange:async(...range)=>{calls.push(range);return [{activityId:'a'}];}};}},
    './dates':{planToday:()=> '2026-10-26'}, './calendar':{calendarMonth},
  };
  const {readCalendarPage}=withStubs('lib/planning/calendar-server.ts',stubs);
  const data=await readCalendarPage('2026-10-26');assert.equal(data.status,'ready');assert.equal(data.items[0].active,false);assert.equal(data.items[0].areaName,'Saúde');assert.deepEqual(calls,[['2026-10-01','2026-10-31']]);assert.deepEqual(await readCalendarPage('2026-10-26'),data);
  assert.equal((await readCalendarPage(['2026-10-26'])).kind,'Validation');
  const anon=withStubs('lib/planning/calendar-server.ts',{...stubs,'@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:null})}})}});
  assert.equal((await anon.readCalendarPage()).kind,'Unauthorized');
});
test('Monday grid, leap year, month/year navigation, civil date limits',()=>{
assert.equal(calendarMonth('2026-10-26').offset,3);assert.equal(calendarMonth('2028-02-29').days.length,29);
assert.equal(calendarMonth('2026-12-31').next,'2027-01-01');assert.equal(calendarMonth('2027-01-01').previous,'2026-12-01');
assert.equal(calendarMonth('0001-01-01').previous,null);assert.equal(calendarMonth('9999-12-31').next,null);assert.throws(()=>calendarMonth('2026-02-30'));
});
test('real items, counts, status, inactive history, selection, today, URLs and empty states',()=>{
const {CalendarBoard}=withStubs('components/calendar/CalendarBoard.tsx',{'next/link':{default:'a'},'@/lib/planning/dates':load('lib/planning/dates.ts'),'@/components/ui/card':{Card:'div',CardContent:'div'},'@/components/ui/ReloadPageButton':{ReloadPageButton:()=>null},'@/components/ui/button':{Button:({children})=>children}});
const item={id:'p',activityId:'a',plannedDate:'2026-10-26',completedAt:null,name:'Real',active:false,areaName:'Saúde'};
const data={status:'ready',today:'2026-10-26',date:'2026-10-26',month:calendarMonth('2026-10-26'),items:[item,{...item,id:'p2',completedAt:'done'},{...item,id:'p3',plannedDate:'2026-10-27',name:'Tomorrow'}]};
const render=data=>renderToStaticMarkup(React.createElement(CalendarBoard,{data})),html=render(data);
for(const text of ['Pendente','Concluído','Saúde','Atividade desativada','aria-current="date"','2 itens planejados, selecionado','/banco-mestre/a','/planejamento?date=2026-10-26','/calendario?date=2026-09-01','/calendario?date=2026-11-01'])assert(html.includes(text),text);
assert(!html.includes('Tomorrow'));assert(render({...data,items:[]}).includes('Nenhum item planejado neste mês'));assert(render({...data,date:'2026-10-28'}).includes('Nenhum item planejado nesta data'));assert(render({status:'error',kind:'Unauthorized',message:'Entre na conta'}).includes('/auth/login'));
});
