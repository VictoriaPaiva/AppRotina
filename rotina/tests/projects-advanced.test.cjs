/* eslint-disable @typescript-eslint/no-require-imports -- Local domain regression tests. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/load-typescript.cjs');
const {taskTreeProgress,projectProgress,projectMainProgress,stagePercent}=load('lib/projects/progress.ts');
const validation=load('lib/projects/validation.ts');
const id='10000000-0000-4000-8000-000000000001',projectId='20000000-0000-4000-8000-000000000001';
const task=(id,stage='not_started',parent=null,weight=1)=>({id,projectId,parentTaskId:parent,progressStage:stage,progressWeight:weight,completedAt:stage==='completed'?'2026-10-31T12:00:00Z':null});
test('tasks: empty, 0/100, 100/0 and every discrete partial stage',()=>{
  assert.equal(projectProgress([]).percentage,0);
  for(const [stage,percent] of Object.entries(stagePercent))assert.equal(projectProgress([task('a',stage)]).percentage,percent);
  assert.equal(projectProgress([task('a','completed'),task('b')]).percentage,50);
});
test('recursive weighted progress uses only roots and never rounds intermediate nodes',()=>{
  const tasks=[task('root'),task('child','not_started','root'),task('a','completed','child'),task('b','in_progress','child'),task('c','not_started','child')];
  const tree=taskTreeProgress(tasks);assert(Math.abs(tree.values.get('child')-155/3)<1e-10);
  assert.equal(tree.percent,155/3);assert.equal(projectProgress(tasks).percentage,52);
  assert.equal(projectProgress([task('a','completed',null,1),task('b','not_started',null,3)]).percentage,25);
  const complete=tasks.map(t=>({...t,progressStage:'completed',completedAt:'today'}));
  assert.equal(projectProgress(complete).percentage,100);
  complete.at(-1).progressStage='finishing';assert(projectProgress(complete).percentage<100);
});
test('deep hierarchy has no fixed level limit and corrupt cycles/missing parents fail closed',()=>{
  const tasks=Array.from({length:10000},(_,i)=>task(String(i),'in_progress',i?String(i-1):null));
  assert.equal(projectProgress(tasks).percentage,55);
  assert.throws(()=>taskTreeProgress([task('a','started','b'),task('b','started','a')]));
  assert.throws(()=>taskTreeProgress([task('a','started','absent')]));
});
test('manual and hybrid preserve independent values without averaging',()=>{
  for(const manualProgressPercent of [0,42,100])assert.equal(projectMainProgress({progressMode:'manual',manualProgressPercent},25),manualProgressPercent);
  assert.equal(projectMainProgress({progressMode:'tasks',manualProgressPercent:100},25),25);
  assert.equal(projectMainProgress({progressMode:'hybrid',manualProgressPercent:42},100),null);
});
test('strict inputs enforce percent, modes, hierarchy, stages, weights and consistent completion',()=>{
  const project={id,title:'Project',description:''};
  assert.equal(validation.createProjectInput(project).progressMode,'tasks');
  for(const extra of [{progressMode:'auto'},{manualProgressPercent:-1},{manualProgressPercent:101},{manualProgressPercent:42.5},{manualProgressPercent:null}])assert.throws(()=>validation.createProjectInput({...project,...extra}));
  const input={id,projectId,title:'Task'};
  for(const extra of [{parentTaskId:id},{parentTaskId:'bad'},{progressStage:'unknown'},{progressWeight:0},{progressWeight:1.5},{progressWeight:2147483648}])assert.throws(()=>validation.createTaskInput({...input,...extra}));
  for(const progressStage of Object.keys(stagePercent)) {
    const completed=progressStage==='completed';
    assert.equal(validation.updateTaskInput({...input,progressStage,completed,expectedUpdatedAt:'2026-10-31T12:00:00Z'}).completed,completed);
    assert.throws(()=>validation.updateTaskInput({...input,progressStage,completed:!completed,expectedUpdatedAt:'2026-10-31T12:00:00Z'}));
  }
  assert.throws(()=>validation.updateTaskInput({...input,parentTaskId:null,completed:false,expectedUpdatedAt:'2026-10-31T12:00:00Z'}));
});
