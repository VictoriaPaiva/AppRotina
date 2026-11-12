/* eslint-disable @typescript-eslint/no-require-imports -- Offline render regression. */
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{randomUUID}=require('node:crypto');
const {withStubs}=require('./helpers/load-with-stubs.cjs');
const stamp='2026-11-02T12:00:00Z';
const {PlanningBoard}=withStubs('components/planning/PlanningBoard.tsx',{
 'next/navigation':{useRouter:()=>({refresh(){}})},'next/link':{default:'a'},
 '@/components/ui/button':{Button:({asChild,children,...props})=>asChild?children:React.createElement('button',props,children)},
 '@/components/ui/card':{Card:'div',CardContent:'div'},'@/components/ui/input':{Input:'input'},'@/components/ui/label':{Label:'label'},
 '@/app/planejamento/actions':{},'@/lib/planning/contracts':require('./helpers/load-typescript.cjs').load('lib/planning/contracts.ts'),'@/lib/planning/dates':require('./helpers/load-typescript.cjs').load('lib/planning/dates.ts'),
});
const item=(name,time,done=false)=>({id:randomUUID(),activityId:randomUUID(),name,plannedDate:'2026-11-02',createdAt:stamp,updatedAt:stamp,completedAt:done?stamp:null,active:true,plannedTime:time,sortOrder:0});
function render(rows,pending=[],completedToday=[]){return renderToStaticMarkup(React.createElement(PlanningBoard,{todayMode:true,data:{status:'ready',today:'2026-11-02',date:'2026-11-02',tomorrow:'2026-11-03',items:rows,pending,completedToday,activities:[]}}));}
test('Hoje sections are Para hoje, Pendências, Concluídas; completed/reopened normal, checklist, quantity and subitems move groups',()=>{
 for(const mechanism of [{},{activityTypeSnapshot:'checklistGoal',checklist:[]},{goalTrackingModeSnapshot:'quantity',quantity:[]},{subitems:[],plannedDurationMinutes:0}]){
  const row={...item('Transition item','09:00'),...mechanism},pending={...item('Older pending',null),plannedDate:'2026-11-01'},other=item('Another open','08:00'),done=item('Earlier completed','07:00',true);
  const check=(html,completed)=>{const p=html.indexOf('Para hoje'),backlog=html.indexOf('Pendências'),end=html.indexOf('Concluídas');assert(p<backlog&&backlog<end);const position=html.indexOf('Transition item');assert(completed?position>end:position>p&&position<backlog);assert(html.indexOf('Older pending')>backlog&&html.indexOf('Older pending')<end);assert(html.indexOf('Earlier completed')>end);};
  check(render([row,other,done],[pending]),false);check(render([{...row,completedAt:stamp},other,done],[pending]),true);check(render([row,other,done],[pending]),false);
 }
});

test('Hoje keeps all 20 mixed completed occurrences, deduplicates the day query and moves a reopened item',()=>{
 const rows=Array.from({length:20},(_,i)=>({...item('Volume '+String(i).padStart(2,'0'),i<10?String(i+7).padStart(2,'0')+':00':null,true),sortOrder:i,
  ...[{},{activityTypeSnapshot:'checklistGoal',checklist:[]},{goalTrackingModeSnapshot:'quantity',quantity:[]},{subitems:[],plannedDurationMinutes:0}][i%4]}));
 const older={...item('Completed backlog',null,true),plannedDate:'2026-11-01'};
 for(const html of [render(rows,[],[...rows,older]),render(rows,[],[...rows,older])]){
  const completed=html.slice(html.indexOf('<h2 class="text-lg font-semibold">Concluídas'));
  for(const row of [...rows,older])assert.equal(completed.split('>'+row.name+'</a>').length-1,1,row.name);
 }
 const reopened={...rows[13],completedAt:null},html=render(rows.map(n=>n.id===reopened.id?reopened:n),[],[...rows.filter(n=>n.id!==reopened.id),older]);
 assert(html.indexOf('>'+reopened.name+'</a>')<html.indexOf('Pendências'));
 const again=render(rows,[],[...rows,older]);assert(again.indexOf('>'+reopened.name+'</a>')>again.indexOf('Concluídas'));
});
