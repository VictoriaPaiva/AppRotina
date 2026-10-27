/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node/React harness. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/load-typescript.cjs'),{withStubs}=require('./helpers/load-with-stubs.cjs');
const validation=load('lib/projects/validation.ts');
const {PersistenceError}=load('lib/banco-mestre/data/errors.ts');
const id='10000000-0000-4000-8000-000000000001';
const project={id,title:'Ideia real',description:'Texto\ncom linhas',createdAt:'2026-10-26T12:00:00Z',updatedAt:'2026-10-26T12:00:00.123456Z'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('strict inputs: title required, description optional, Unicode length and immutable/owner fields rejected',()=>{
  assert.equal(validation.createProjectInput({id,title:'  Ideia  ',description:''}).title,'Ideia');
  assert.equal(validation.createProjectInput({id,title:'😀'.repeat(200),description:'x'.repeat(100000)}).title.length,400);
  for(const extra of [{user_id:id},{updated_at:'x'},{title:'  '},{title:'x'.repeat(201)},{description:'x'.repeat(100001)},{description:'\u0000'},{id:'bad'}])assert.throws(()=>validation.createProjectInput({id,title:'Título',description:'',...extra}));
  assert.equal(validation.updateProjectInput({id,title:'Título',description:'',expectedUpdatedAt:project.updatedAt}).expectedUpdatedAt,project.updatedAt);
});
function actionsHarness({failure,authFailure=false}={}) {
  const calls=[],paths=[];
  const repo={create:async v=>{calls.push(v);if(failure)throw failure;return project;},update:async v=>{calls.push(v);if(failure)throw failure;return project;}};
  return {calls,paths,...withStubs('app/projetos/actions.ts',{
    'next/cache':{revalidatePath:p=>paths.push(p)},
    '@/lib/projects/server':{projectRepositoryForSession:async()=>{if(authFailure)throw new PersistenceError('Unauthorized');return repo;}},
    '@/lib/projects/validation':validation,'@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
  })};
}
test('actions validate before session, invalidate only confirmed saves and return safe session/network/conflict errors',async()=>{
  const h=actionsHarness();assert.deepEqual(await h.createProject({id,title:project.title,description:project.description}),{ok:true,project});assert.deepEqual(h.paths,['/projetos',`/projetos/${id}`]);
  assert.equal((await h.createProject({id,title:'',description:''})).kind,'Validation');assert.equal(h.calls.length,1);
  assert((await h.updateProject({id,title:project.title,description:'new',expectedUpdatedAt:project.updatedAt})).ok);assert.equal(h.calls[1].expectedUpdatedAt,project.updatedAt);
  for(const config of [{authFailure:true},{failure:Error('private SQL')},{failure:new PersistenceError('Conflict')}]) {
    const f=actionsHarness(config),result=await f.createProject({id,title:'Valid',description:''});assert.equal(result.ok,false);assert.equal(f.paths.length,0);assert(!JSON.stringify(result).includes('private SQL'));
  }
});
test('server verifies claims before repository and never substitutes mocks on failures',async()=>{
  let reads=0;const stubs={
    '@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:id}},error:null})}})},
    '@/lib/banco-mestre/data/errors':{PersistenceError},'@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
    './repository':{createProjectRepository:(_client,owner)=>{assert.equal(owner,id);return {list:async()=>{reads++;return [project];},tasks:async()=>[],get:async requested=>{assert.equal(requested,id);return project;}};}},
  };
  const server=withStubs('lib/projects/server.ts',stubs);assert.deepEqual((await server.readProjects()).projects,[project]);assert.deepEqual((await server.readProject(id)).project,project);
  for(const result of [{data:null,error:null},{data:{claims:{sub:id}},error:{code:'expired'}}]) {
    const expired=withStubs('lib/projects/server.ts',{...stubs,'@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>result}})}});
    assert.equal((await expired.readProjects()).kind,'Unauthorized');
  }assert.equal(reads,1);
});
function editorHarness({initial=project,create,update}={}) {
  const slots=[],paths=[];let cursor=0,refreshes=0;
  const react={useRef(value){const i=cursor++;slots[i]??={current:value};return slots[i];},useState(value){const i=cursor++;slots[i]??={value};return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}];}};
  const {ProjectEditor}=withStubs('components/projects/ProjectEditor.tsx',{
    react,'next/link':{default:'a'},'next/navigation':{useRouter:()=>({replace:p=>paths.push(p),refresh(){refreshes++;}})},
    '@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},'@/components/ui/label':{Label:'label'},
    '@/app/projetos/actions':{createProject:create,updateProject:update},'@/lib/projects/validation':validation,
  });
  const nodes=(node,predicate)=>!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(child=>nodes(child,predicate))];
  const render=()=>{cursor=0;return ProjectEditor({project:initial});};
  const find=predicate=>nodes(render(),predicate)[0];
  return {find,paths,refreshes:()=>refreshes,change:(field,value)=>find(n=>n.props?.id===field).props.onChange({target:{value}}),submit:()=>find(n=>n.type==='form').props.onSubmit({preventDefault(){}})};
}
test('editing preserves draft on expired session/network/conflict, never reports false success',async()=>{
  for(const failure of ['throw','Unauthorized','Conflict']) {
    const calls=[],h=editorHarness({update:async input=>{calls.push(input);if(failure==='throw')throw Error('network');return {ok:false,kind:failure,message:'Falha segura'};}});
    h.change('project-title','Rascunho');h.change('project-description','Texto longo\n'.repeat(100));await h.submit();
    assert.equal(h.find(n=>n.props?.id==='project-title').props.value,'Rascunho');assert.equal(calls[0].expectedUpdatedAt,project.updatedAt);assert(h.find(n=>n.props?.role==='alert'));assert(!h.find(n=>n.props?.role==='status'));assert.equal(h.refreshes(),0);assert.equal(h.paths.length,0);
    if(failure==='Unauthorized')assert(h.find(n=>n.props?.href==='/auth/login'));
  }
});
test('new project preserves attempt UUID after uncertain save, blocks duplicate clicks and navigates only after confirmed success',async()=>{
  const calls=[];let resolve;
  const h=editorHarness({initial:null,create:async input=>{calls.push(input);if(calls.length===1)throw Error('network');return new Promise(r=>{resolve=r;});}});
  h.change('project-title','Nova');await h.submit();assert.equal(h.paths.length,0);
  h.submit();h.submit();assert.equal(calls.length,2);assert.equal(calls[0].id,calls[1].id);
  resolve({ok:true,project:{...project,id:calls[0].id}});await tick();assert.deepEqual(h.paths,[`/projetos/${calls[0].id}`]);assert.equal(h.refreshes(),1);
  h.submit();assert.equal(calls.length,2);
});
test('confirmed edit adopts database snapshot for next save',async()=>{
  const calls=[],h=editorHarness({update:async input=>{calls.push(input);return {ok:true,project:{...project,title:input.title,updatedAt:'2026-10-26T13:00:00.123456Z'}};}});
  h.change('project-title','Editada');await h.submit();assert(h.find(n=>n.props?.role==='status'));
  h.change('project-title','Segunda');await h.submit();assert.equal(calls[1].expectedUpdatedAt,'2026-10-26T13:00:00.123456Z');
});
test('conflict reload requires consent before discarding local draft',async()=>{
  const originalWindow=global.window;let consent=false,reloads=0;
  global.window={confirm:()=>consent,location:{reload(){reloads++;}}};
  try {
    const h=editorHarness({update:async()=>({ok:false,kind:'Conflict',message:'Recarregue'})});
    h.change('project-title','Rascunho');await h.submit();
    const reload=()=>h.find(n=>n.type==='button'&&n.props.children==='Recarregar dados salvos').props.onClick();
    reload();assert.equal(reloads,0);assert.equal(h.find(n=>n.props?.id==='project-title').props.value,'Rascunho');
    consent=true;reload();assert.equal(reloads,1);
  } finally {global.window=originalWindow;}
});
