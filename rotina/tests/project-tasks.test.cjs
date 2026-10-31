/* eslint-disable @typescript-eslint/no-require-imports -- Offline UI/action harness. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/load-typescript.cjs'),{withStubs}=require('./helpers/load-with-stubs.cjs');
const validation=load('lib/projects/validation.ts'),progress=load('lib/projects/progress.ts');
const {PersistenceError}=load('lib/banco-mestre/data/errors.ts');
const id='10000000-0000-4000-8000-000000000001',projectId='20000000-0000-4000-8000-000000000001';
const task={id,projectId,title:'Task',completedAt:null,createdAt:'2026-10-27T12:00:00Z',updatedAt:'2026-10-27T12:00:00.123456Z'};
test('task validation rejects owner, audit fields, bad titles, missing completion boolean and malformed snapshot',()=>{
  assert.equal(validation.createTaskInput({id,projectId,title:'  Task  '}).title,'Task');
  for(const extra of [{user_id:id},{completed:true},{title:''},{title:'x'.repeat(201)},{projectId:'bad'},{title:'\0'}])assert.throws(()=>validation.createTaskInput({id,projectId,title:'Task',...extra}));
  for(const extra of [{completed:'true'},{expectedUpdatedAt:'bad'},{completed_at:null}])assert.throws(()=>validation.updateTaskInput({id,projectId,title:'Task',completed:false,expectedUpdatedAt:task.updatedAt,...extra}));
  assert.deepEqual(progress.projectProgress([]),{completed:0,total:0,percentage:0});
  assert.equal(progress.projectProgress([task,{...task,id:'second',completedAt:task.updatedAt}]).percentage,50);
});
test('task actions reject expired sessions/network errors, invalidate only confirmed saves',async()=>{
  for(const failure of [null,new PersistenceError('Unauthorized'),Error('private network details')]) {
    const paths=[],calls=[];
    const actions=withStubs('app/projetos/actions.ts',{
      'next/cache':{revalidatePath:p=>paths.push(p)},'@/lib/projects/server':{projectRepositoryForSession:async()=>{if(failure?.kind==='Unauthorized')throw failure;return {createTask:async v=>{calls.push(v);if(failure)throw failure;return task;},updateTask:async()=>task};}},
      '@/lib/projects/validation':validation,'@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
    });
    const result=await actions.createTask({id,projectId,title:'Task'});
    assert.equal(result.ok,!failure);assert.deepEqual(paths,failure?[]:['/projetos','/projetos/'+projectId]);assert(!JSON.stringify(result).includes('private network'));
    if(!failure)assert((await actions.updateTask({id,projectId,title:'Task',completed:true,expectedUpdatedAt:task.updatedAt})).ok);
  }
});
function harness(name,actions,props={}) {
  const slots=[];let cursor=0;const callbacks=[];
  const react={useRef(value){const i=cursor++;slots[i]??={current:value};return slots[i];},useState(value){const i=cursor++;slots[i]??={value};return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}];}};
  const components=withStubs('components/projects/ProjectTasks.tsx',{
    react,'next/link':{default:'a'},'@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},'@/app/projetos/actions':actions,'@/lib/projects/progress':progress,
  });
  const nodes=(node,predicate)=>!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(child=>nodes(child,predicate))];
  const render=()=>{cursor=0;return components[name](name==='TaskRow'?{task,onSaved:t=>callbacks.push(t),...props}:{projectId,initialTasks:[],...props});};
  const find=predicate=>nodes(render(),predicate)[0];
  return {find,callbacks,change:value=>find(n=>n.type==='input'&&n.props.type!=='checkbox').props.onChange({target:{value}}),submit:()=>find(n=>n.type==='form').props.onSubmit({preventDefault(){}})};
}
test('task title and checkbox retain confirmed state and draft on network/session/conflict failures',async()=>{
  for(const kind of ['throw','Unauthorized','Conflict']) {
    const calls=[],h=harness('TaskRow',{updateTask:async input=>{calls.push(input);if(kind==='throw')throw Error('network');return {ok:false,kind,message:'Failure'};}});
    h.change('Draft');await h.find(n=>n.props?.type==='checkbox').props.onChange({target:{checked:true}});
    assert.equal(h.find(n=>n.props?.type==='checkbox').props.checked,false);
    assert.equal(h.find(n=>n.type==='input'&&n.props.type!=='checkbox').props.value,'Draft');
    assert.equal(calls[0].expectedUpdatedAt,task.updatedAt);assert.equal(calls[0].completed,true);assert.equal(h.callbacks.length,0);assert(!h.find(n=>n.props?.role==='status'));
    const failure=h.find(n=>typeof n.type==='function'&&n.props.failure);assert.equal(failure.props.failure.kind,kind==='throw'?'Unknown':kind);
  }
});

test('V0.3 leaf slider has seven discrete keyboard stops, stages and weights persist only after save',async()=>{
  const calls=[],h=harness('TaskRow',{updateTask:async input=>{calls.push(input);return {ok:true,task:{...task,...input,completedAt:input.completed?task.updatedAt:null,updatedAt:'2026-10-31T12:00:00Z'}};}});
  const range=()=>h.find(n=>n.props?.type==='range');assert.equal(range().props.max,6);assert.equal(range().props.step,1);
  range().props.onChange({target:{value:'3'}});
  h.find(n=>n.type==='select').props.onChange({target:{value:'3'}});assert.equal(calls.length,0);
  await h.submit();await new Promise(r=>setImmediate(r));assert.equal(calls[0].progressStage,'in_progress');assert.equal(calls[0].progressWeight,3);assert.equal(calls[0].completed,false);
  range().props.onChange({target:{value:'6'}});await h.submit();await new Promise(r=>setImmediate(r));assert.equal(calls[1].completed,true);
});

test('V0.3 parent progress is read-only and native expand/collapse has no write handler',async()=>{
  const calls=[],parent=harness('TaskRow',{updateTask:async input=>{calls.push(input);return {ok:true,task};}},{childrenCount:2,derivedPercent:52});
  assert(!parent.find(n=>n.props?.type==='range'));assert(parent.find(n=>n.props?.type==='checkbox').props.disabled);
  const tree=harness('ProjectTasks',{createTask:async input=>{calls.push(input);return {ok:true,task:{...task,id:input.id,parentTaskId:input.parentTaskId}};}},{initialTasks:[task]});
  const details=tree.find(n=>n.type==='details');assert(details);assert.equal(details.props.onToggle,undefined);assert.equal(calls.length,0);
  tree.find(n=>n.props?.['aria-label']==='Tarefa pai').props.onChange({target:{value:task.id}});
  tree.change('Child');await tree.submit();assert.equal(calls[0].parentTaskId,task.id);
  assert.equal(tree.find(n=>n.props?.['aria-label']==='Tarefa pai').props.value,'');
});
test('confirmed task completion adopts new snapshot; pending duplicate clicks are blocked',async()=>{
  let resolve;const calls=[],h=harness('TaskRow',{updateTask:async input=>{calls.push(input);return new Promise(r=>{resolve=r;});}});
  const toggle=checked=>h.find(n=>n.props?.type==='checkbox').props.onChange({target:{checked}});
  const pending=toggle(true);toggle(true);assert.equal(calls.length,1);assert.equal(h.callbacks.length,0);
  resolve({ok:true,task:{...task,completedAt:task.updatedAt,updatedAt:'2026-10-27T13:00:00.123456Z'}});await pending;await new Promise(r=>setImmediate(r));
  assert.equal(h.find(n=>n.props?.type==='checkbox').props.checked,true);assert.equal(h.callbacks.length,1);
  const undo=toggle(false);assert.equal(calls[1].expectedUpdatedAt,'2026-10-27T13:00:00.123456Z');resolve({ok:true,task:{...task,updatedAt:'2026-10-27T14:00:00Z'}});await undo;await new Promise(r=>setImmediate(r));
  assert.equal(h.find(n=>n.props?.type==='checkbox').props.checked,false);
});
test('adding task retains title/attempt on uncertain response, prevents duplicate submits, clears only confirmed save',async()=>{
  const calls=[];let resolve;
  const h=harness('ProjectTasks',{createTask:async input=>{calls.push(input);if(calls.length===1)throw Error('network');return new Promise(r=>{resolve=r;});}});
  h.change('New task');await h.submit();assert.equal(h.find(n=>n.type==='input').props.value,'New task');assert(!h.find(n=>n.props?.role==='status'));
  const pending=h.submit();h.submit();assert.equal(calls.length,2);assert.equal(calls[0].id,calls[1].id);
  resolve({ok:true,task:{...task,id:calls[1].id}});await pending;await new Promise(r=>setImmediate(r));assert.equal(h.find(n=>n.type==='input').props.value,'');assert(h.find(n=>n.props?.role==='status'));
});
