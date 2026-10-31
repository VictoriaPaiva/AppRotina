/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node/React harness. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {load}=require('./helpers/load-typescript.cjs'),{withStubs}=require('./helpers/load-with-stubs.cjs');
const validation=load('lib/ideas/validation.ts');
const {PersistenceError}=load('lib/banco-mestre/data/errors.ts');
const id='10000000-0000-4000-8000-000000000001';
const idea={id,title:'Ideia real',content:'Texto\ncom linhas',createdAt:'2026-10-26T12:00:00Z',updatedAt:'2026-10-26T12:00:00.123456Z'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('strict inputs: title required, content optional, Unicode length and immutable/owner fields rejected',()=>{
  assert.equal(validation.createIdeaInput({id,title:'  Ideia  ',content:''}).title,'Ideia');
  assert.equal(validation.createIdeaInput({id,title:'😀'.repeat(200),content:'x'.repeat(100000)}).title.length,400);
  for(const extra of [{user_id:id},{updated_at:'x'},{title:'  '},{title:'x'.repeat(201)},{content:'x'.repeat(100001)},{content:'\u0000'},{id:'bad'}])assert.throws(()=>validation.createIdeaInput({id,title:'Título',content:'',...extra}));
  assert.equal(validation.updateIdeaInput({id,title:'Título',content:'',expectedUpdatedAt:idea.updatedAt}).expectedUpdatedAt,idea.updatedAt);
});
function actionsHarness({failure,authFailure=false}={}) {
  const calls=[],paths=[];
  const repo={create:async v=>{calls.push(v);if(failure)throw failure;return idea;},update:async v=>{calls.push(v);if(failure)throw failure;return idea;}};
  return {calls,paths,...withStubs('app/ideias/actions.ts',{
    'next/cache':{revalidatePath:p=>paths.push(p)},
    '@/lib/ideas/server':{ideaRepositoryForSession:async()=>{if(authFailure)throw new PersistenceError('Unauthorized');return repo;}},
    '@/lib/ideas/validation':validation,'@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
  })};
}
test('actions validate before session, invalidate only confirmed saves and return safe session/network/conflict errors',async()=>{
  const h=actionsHarness();assert.deepEqual(await h.createIdea({id,title:idea.title,content:idea.content}),{ok:true,idea});assert.deepEqual(h.paths,['/ideias',`/ideias/${id}`]);
  assert.equal((await h.createIdea({id,title:'',content:''})).kind,'Validation');assert.equal(h.calls.length,1);
  assert((await h.updateIdea({id,title:idea.title,content:'new',expectedUpdatedAt:idea.updatedAt})).ok);assert.equal(h.calls[1].expectedUpdatedAt,idea.updatedAt);
  for(const config of [{authFailure:true},{failure:Error('private SQL')},{failure:new PersistenceError('Conflict')}]) {
    const f=actionsHarness(config),result=await f.createIdea({id,title:'Valid',content:''});assert.equal(result.ok,false);assert.equal(f.paths.length,0);assert(!JSON.stringify(result).includes('private SQL'));
  }
});
test('server verifies claims before repository and never substitutes mocks on failures',async()=>{
  let reads=0;const stubs={
    '@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>({data:{claims:{sub:id}},error:null})}})},
    '@/lib/banco-mestre/data/errors':{PersistenceError},'@/lib/banco-mestre/data/read-model':load('lib/banco-mestre/data/read-model.ts'),
    './repository':{createIdeaRepository:(_client,owner)=>{assert.equal(owner,id);return {list:async()=>{reads++;return [idea];},get:async requested=>{assert.equal(requested,id);return idea;}};}},
  };
  const server=withStubs('lib/ideas/server.ts',stubs);assert.deepEqual((await server.readIdeas()).ideas,[idea]);assert.deepEqual((await server.readIdea(id)).idea,idea);
  for(const result of [{data:null,error:null},{data:{claims:{sub:id}},error:{code:'expired'}}]) {
    const expired=withStubs('lib/ideas/server.ts',{...stubs,'@/lib/supabase/server':{createClient:async()=>({auth:{getClaims:async()=>result}})}});
    assert.equal((await expired.readIdeas()).kind,'Unauthorized');
  }assert.equal(reads,1);
});
const presentation=withStubs('lib/ideas/presentation.tsx',{'next/link':{default:'a'}});
test('real list has empty/multiple states, short escaped previews, dates and detail links',()=>{
  const render=ideas=>renderToStaticMarkup(React.createElement(presentation.IdeaList,{ideas}));
  assert(render([]).includes('Você ainda não tem ideias'));
  const html=render([idea,{...idea,id:'second',title:'<script>',content:'x'.repeat(400)}]);
  for(const text of ['Ideia real','/ideias/'+id,'&lt;script&gt;','Atualizada em','…'])assert(html.includes(text));
  assert(!html.includes('x'.repeat(181)));assert.equal(presentation.ideaPreview('a\n  b'),'a b');
});
function editorHarness({initial=idea,create,update}={}) {
  const slots=[],paths=[];let cursor=0,refreshes=0,cleanup;
  const react={useLayoutEffect(setup){cursor++;cleanup??=setup();},useRef(value){const i=cursor++;slots[i]??={current:value};return slots[i];},useState(value){const i=cursor++;slots[i]??={value};return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}];}};
  const {IdeaEditor}=withStubs('components/ideas/IdeaEditor.tsx',{
    react,'next/link':{default:'a'},'next/navigation':{useRouter:()=>({replace:p=>paths.push(p),refresh(){refreshes++;}})},
    '@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},'@/components/ui/label':{Label:'label'},
    '@/app/ideias/actions':{createIdea:create,updateIdea:update},'@/lib/ideas/validation':validation,'@/lib/ideas/presentation':presentation,
  });
  const nodes=(node,predicate)=>!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(child=>nodes(child,predicate))];
  const render=()=>{cursor=0;return IdeaEditor({idea:initial});};
  const find=predicate=>nodes(render(),predicate)[0];
  return {find,paths,hide(){cleanup?.();cleanup=undefined;},refreshes:()=>refreshes,change:(field,value)=>find(n=>n.props?.id===field).props.onChange({target:{value}}),submit:()=>find(n=>n.type==='form').props.onSubmit({preventDefault(){}})};
}

test('Activity retires completed idea A, reopens empty and creates distinct B without writes to A or automatic navigation',async()=>{
  const records=new Map(),calls=[];
  const h=editorHarness({initial:null,create:async input=>{
    assert(!records.has(input.id));calls.push({...input});
    const saved={...idea,...input};records.set(input.id,saved);return {ok:true,idea:saved};
  },update:async()=>assert.fail('new flow must never update idea A')});
  let first;
  for(const title of ['Ideia A','Ideia B']) {
    assert.equal(h.find(n=>n.type==='h1').props.children,'Nova ideia');
    for(const field of ['idea-title','idea-content']) {
      const input=h.find(n=>n.props?.id===field);assert.equal(input.props.value,'');assert.equal(input.props.disabled,false);
    }
    assert(!h.find(n=>n.props?.role==='status'||n.props?.role==='alert'));
    assert.equal(h.paths.length,calls.length);
    h.change('idea-title',title);h.change('idea-content',title+' content');await h.submit();
    const saved=calls.at(-1);assert.equal(h.paths.at(-1),`/ideias/${saved.id}`);
    assert(h.find(n=>n.props?.role==='status'));assert(h.find(n=>n.props?.href==='/ideias'));
    await h.submit();assert.equal(calls.length,title==='Ideia A'?1:2);
    if(!first)first={...records.get(saved.id)};
    h.hide(); // Retain hook slots/refs across navigation, as Activity does.
    assert.equal(h.find(n=>n.type==='h1').props.children,'Nova ideia');
    assert.equal(calls.length,title==='Ideia A'?1:2);
    assert.deepEqual(records.get(first.id),first);
  }
  assert.notEqual(calls[0].id,calls[1].id);assert.equal(records.size,2);
  assert.deepEqual(calls.map(c=>c.title),['Ideia A','Ideia B']);
});

test('Activity preserves unfinished idea drafts, uncertain attempt UUID and existing edit snapshots',async()=>{
  const calls=[];
  const draft=editorHarness({initial:null,create:async input=>{calls.push(input);return {ok:false,kind:'Unknown',message:'Unconfirmed'};}});
  draft.change('idea-title','Draft');draft.change('idea-content','Keep text');
  draft.hide();assert.equal(draft.find(n=>n.props?.id==='idea-title').props.value,'Draft');
  await draft.submit();draft.hide();
  assert.equal(draft.find(n=>n.props?.id==='idea-content').props.value,'Keep text');
  assert(draft.find(n=>n.props?.role==='alert'));await draft.submit();assert.equal(calls[0].id,calls[1].id);
  const updates=[],edit=editorHarness({update:async input=>{updates.push(input);return {ok:true,idea:{...idea,title:input.title,updatedAt:'2026-10-31T12:00:00Z'}};}});
  edit.change('idea-title','Edited A');edit.hide();
  assert.equal(edit.find(n=>n.props?.id==='idea-title').props.value,'Edited A');
  await edit.submit();edit.hide(); // Confirmed edits remain in the edit flow.
  assert.equal(edit.find(n=>n.type==='h1').props.children,'Editar ideia');
  assert.equal(edit.find(n=>n.props?.id==='idea-title').props.value,'Edited A');
  edit.change('idea-title','Edited again');await edit.submit();
  assert.equal(updates[1].id,idea.id);assert.equal(updates[1].expectedUpdatedAt,'2026-10-31T12:00:00Z');
  const fresh=editorHarness({initial:null,create:async()=>assert.fail('opening new idea must not write')});
  assert.equal(fresh.find(n=>n.props?.id==='idea-title').props.value,'');
  assert.equal(fresh.find(n=>n.props?.id==='idea-content').props.value,'');
  assert.deepEqual(fresh.paths,[]);
});
test('editing preserves draft on expired session/network/conflict, never reports false success',async()=>{
  for(const failure of ['throw','Unauthorized','Conflict']) {
    const calls=[],h=editorHarness({update:async input=>{calls.push(input);if(failure==='throw')throw Error('network');return {ok:false,kind:failure,message:'Falha segura'};}});
    h.change('idea-title','Rascunho');h.change('idea-content','Texto longo\n'.repeat(100));await h.submit();
    assert.equal(h.find(n=>n.props?.id==='idea-title').props.value,'Rascunho');assert.equal(calls[0].expectedUpdatedAt,idea.updatedAt);assert(h.find(n=>n.props?.role==='alert'));assert(!h.find(n=>n.props?.role==='status'));assert.equal(h.refreshes(),0);assert.equal(h.paths.length,0);
    if(failure==='Unauthorized')assert(h.find(n=>n.props?.href==='/auth/login'));
  }
});
test('new idea preserves attempt UUID after uncertain save, blocks duplicate clicks and navigates only after confirmed success',async()=>{
  const calls=[];let resolve;
  const h=editorHarness({initial:null,create:async input=>{calls.push(input);if(calls.length===1)throw Error('network');return new Promise(r=>{resolve=r;});}});
  h.change('idea-title','Nova');await h.submit();assert.equal(h.paths.length,0);
  h.submit();h.submit();assert.equal(calls.length,2);assert.equal(calls[0].id,calls[1].id);
  resolve({ok:true,idea:{...idea,id:calls[0].id}});await tick();assert.deepEqual(h.paths,[`/ideias/${calls[0].id}`]);assert.equal(h.refreshes(),1);
  h.submit();assert.equal(calls.length,2);
});
test('confirmed edit adopts database snapshot for next save',async()=>{
  const calls=[],h=editorHarness({update:async input=>{calls.push(input);return {ok:true,idea:{...idea,title:input.title,updatedAt:'2026-10-26T13:00:00.123456Z'}};}});
  h.change('idea-title','Editada');await h.submit();assert(h.find(n=>n.props?.role==='status'));
  h.change('idea-title','Segunda');await h.submit();assert.equal(calls[1].expectedUpdatedAt,'2026-10-26T13:00:00.123456Z');
});
test('conflict reload requires consent before discarding local draft',async()=>{
  const originalWindow=global.window;let consent=false,reloads=0;
  global.window={confirm:()=>consent,location:{reload(){reloads++;}}};
  try {
    const h=editorHarness({update:async()=>({ok:false,kind:'Conflict',message:'Recarregue'})});
    h.change('idea-title','Rascunho');await h.submit();
    const reload=()=>h.find(n=>n.type==='button'&&n.props.children==='Recarregar dados salvos').props.onClick();
    reload();assert.equal(reloads,0);assert.equal(h.find(n=>n.props?.id==='idea-title').props.value,'Rascunho');
    consent=true;reload();assert.equal(reloads,1);
  } finally {global.window=originalWindow;}
});
