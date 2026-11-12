/* eslint-disable @typescript-eslint/no-require-imports -- Local hierarchy/domain and rendering regressions. */
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {load}=require('./helpers/load-typescript.cjs'),{withStubs}=require('./helpers/load-with-stubs.cjs');
const sub=load('lib/activities/subitems.ts');
const node=(name,durationMinutes,parentId=null)=>({id:crypto.randomUUID(),parentId,name,durationMinutes,sortOrder:0,active:true,defaultSelected:true});
function fixture(){const sala=node('Sala',1),kitchen=node('Cozinha',1),bath=node('Banheiro',30);return {mode:'all',items:[sala,kitchen,bath,...[15,15,15].map((m,i)=>node('Sala '+i,m,sala.id)),node('Louça',20,kitchen.id),node('Armário',30,kitchen.id)]};}

test('deleting definitions removes full branches, preserves sibling order/custom defaults and frozen occurrences',()=>{
  const tree=fixture(),snapshot=sub.initialSelection(tree),frozen=structuredClone(snapshot);
  tree.mode='custom';tree.items[3].defaultSelected=false;
  const withoutLeaf=sub.removeSubitemBranch(tree,tree.items[4].id);
  assert.equal(sub.subitemTotal(sub.initialSelection({...withoutLeaf,mode:'all'})),110);
  assert.equal(sub.subitemTotal(sub.initialSelection(withoutLeaf)),95);
  assert.deepEqual(withoutLeaf.items,tree.items.filter(n=>n.id!==tree.items[4].id));
  const withoutGroup=sub.removeSubitemBranch(tree,tree.items[0].id);
  assert.equal(withoutGroup.items.length,tree.items.length-4);
  assert.equal(sub.subitemTotal(sub.initialSelection({...withoutGroup,mode:'all'})),80);
  assert.deepEqual(snapshot,frozen);assert.equal(sub.subitemTotal(snapshot),125);
  sub.validateTree(withoutGroup);
  assert.throws(()=>sub.validateSubitemDeletions([tree.items[1].id],withoutGroup));
  assert.throws(()=>sub.validateSubitemDeletions([tree.items[0].id,tree.items[0].id],withoutGroup));
});

test('definition delete requires named confirmation with all descendants and never writes remotely',()=>{
  const {SubitemDefinitionEditor}=withStubs('components/banco-mestre/SubitemDefinitionEditor.tsx',{'@/components/ui/input':{Input:'input'},'@/components/ui/button':{Button:'button'}});
  let value=fixture(),changes=0,approved=false;const messages=[];
  const original=global.window,originalDocument=global.document,originalFrame=global.requestAnimationFrame;
  global.window={confirm:message=>{messages.push(message);return approved;}};
  global.document={getElementById:()=>null};global.requestAnimationFrame=callback=>callback();
  let focused=0;
  const scope={querySelector:selector=>{assert.equal(selector,'[data-add-subitem]');return {focus:()=>focused++};}};
  const event={currentTarget:{closest:selector=>{assert.equal(selector,'[data-field="subitems"]');return scope;}}};
  function nodes(n){return !n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];}
  const render=(disabled=false)=>SubitemDefinitionEditor({value,disabled,onChange:next=>{value=next;changes++;}});
  const button=(name,disabled=false)=>nodes(render(disabled)).find(n=>n.props?.['aria-label']==='Excluir subitem '+name);
  try{
    const originalTree=structuredClone(value);
    button('Sala').props.onClick(event);assert.equal(changes,0);assert.equal(focused,0);assert.deepEqual(value,originalTree);
    assert(messages[0].includes('Sala'));assert(messages[0].includes('3 subitens'));assert(messages[0].includes('snapshots'));
    approved=true;button('Sala',true).props.onClick(event);assert.equal(changes,0);
    const destructive=button('Sala');assert.equal(destructive.props.variant,'destructive');assert.match(destructive.props.className,/min-h-11/);
    destructive.props.onClick(event);assert.equal(changes,1);assert.equal(focused,1);assert.equal(value.items.length,4);
    assert(nodes(render()).some(n=>n.props?.['data-add-subitem']));
    // Newly created local nodes follow the exact same draft-only path.
    nodes(render()).find(n=>n.props?.children==='Adicionar subitem').props.onClick();
    button('Novo subitem').props.onClick(event);assert.equal(focused,2);assert.equal(value.items.length,4);
    assert(messages.at(-1).includes('Excluir “Novo subitem”?'));
  }finally{
    if(original===undefined)delete global.window;else global.window=original;
    if(originalDocument===undefined)delete global.document;else global.document=originalDocument;
    if(originalFrame===undefined)delete global.requestAnimationFrame;else global.requestAnimationFrame=originalFrame;
  }
});
test('Faxina 125 / 95 / 45, branch override, no double count and independent occurrences',()=>{
  const tree=fixture(),a=sub.initialSelection(tree),b=sub.initialSelection(tree),bath=tree.items.find(n=>n.name==='Banheiro'),sala=tree.items[0];
  assert.equal(sub.subitemTotal(a),125);
  const without=sub.toggleBranch(a,bath.id,false);assert.equal(sub.subitemTotal(without),95);
  const only=sub.toggleBranch(sub.initialSelection({...tree,mode:'none'}),sala.id,true);assert.equal(sub.subitemTotal(only),45);
  assert.equal(sub.subitemTotal(only.map(n=>n.id===sala.id?{...n,overrideMinutes:30}:n)),30);
  assert.equal(sub.subitemTotal(b),125);assert.equal(tree.items[0].durationMinutes,1);
  assert.deepEqual(sub.selectionPayload(a),sub.selectionPayload([...a].reverse()));
});
test('all none custom, partial selection, parent toggles and grandchild selection',()=>{
  const tree=fixture(),sala=tree.items[0],leaf=tree.items.find(n=>n.parentId===sala.id);
  assert(sub.initialSelection(tree).every(n=>n.selected));assert(sub.initialSelection({...tree,mode:'none'}).every(n=>!n.selected));
  tree.items.forEach(n=>n.defaultSelected=n.id===leaf.id);
  let selected=sub.initialSelection({...tree,mode:'custom'});assert.equal(sub.selectionState(selected,sala.id),'indeterminate');assert.equal(sub.subitemTotal(selected),15);
  selected=sub.toggleBranch(selected,sala.id,true);assert.equal(sub.selectionState(selected,sala.id),true);
  selected=sub.toggleBranch(selected,sala.id,false);assert.equal(sub.selectionState(selected,sala.id),false);
  const grand=node('Neto',7,leaf.id);tree.items.push(grand);
  selected=sub.toggleBranch(sub.initialSelection({...tree,mode:'none'}),grand.id,true);assert.equal(sub.subitemTotal(selected),7);assert.equal(sub.selectionState(selected,sala.id),'indeterminate');
  sala.active=false;assert(!sub.initialSelection(tree).some(n=>n.id===grand.id));
  sala.active=true;for(const n of tree.items)if(n.parentId===sala.id)n.active=false;
  assert(!sub.initialSelection(tree).some(n=>n.id===sala.id));
});
test('completion partial rolls through multiple levels; unselected leaves do not influence parent',()=>{
  const tree=fixture(),sala=tree.items[0],first=tree.items.find(n=>n.parentId===sala.id);
  let items=sub.initialSelection(tree).map(n=>n.id===first.id?{...n,completedAt:'2026-10-31T12:00:00Z'}:n);
  assert.equal(sub.completionState(items,sala.id),'indeterminate');
  items=sub.toggleBranch(items,sala.id,false);items=sub.toggleBranch(items,first.id,true).map(n=>n.id===first.id?{...n,completedAt:'2026-10-31T12:00:00Z'}:n);
  assert.equal(sub.completionState(items,sala.id),true);
});
test('deep trees, self-parent, cycles, missing/cross-tree parent, duplicate IDs and strict payloads',()=>{
  const items=Array.from({length:2000},(_,i)=>({id:String(i),parentId:i?String(i-1):null,name:'Node',durationMinutes:1,sortOrder:0,active:true,defaultSelected:true}));
  assert.equal(sub.subitemTotal(sub.initialSelection({mode:'all',items})),1);
  const tree=fixture();sub.validateTree(tree);
  for(const bad of [{...tree,mode:'other'},{...tree,items:[{...tree.items[0],parentId:tree.items[0].id}]},{...tree,items:[{...tree.items[0],parentId:crypto.randomUUID()}]},{...tree,items:[tree.items[0],tree.items[0]]},{...tree,items:[{...tree.items[0],durationMinutes:1.5}]}])assert.throws(()=>sub.validateTree(bad));
  const x=node('X',1),y=node('Y',1,x.id);x.parentId=y.id;assert.throws(()=>sub.validateTree({mode:'all',items:[x,y]}));
  assert.throws(()=>sub.validateSelection([{id:x.id,selected:true,overrideMinutes:-1}]));
  assert.throws(()=>sub.validateSelection([{id:x.id,selected:true,overrideMinutes:null,user_id:x.id}]));
});
test('selection tree exposes mixed checkbox, live total, default override and native collapse without writes',()=>{
  const tree=fixture(),leaf=tree.items.find(n=>n.parentId===tree.items[0].id);
  const values=sub.toggleBranch(sub.initialSelection({...tree,mode:'none'}),leaf.id,true);
  let writes=0;
  const ui={'@/components/ui/input':{Input:'input'},'@/components/ui/checkbox':{Checkbox:props=>React.createElement('button',{'aria-label':props['aria-label'],'aria-checked':props.checked==='indeterminate'?'mixed':props.checked})}};
  const {SubitemSelection}=withStubs('components/planning/SubitemSelection.tsx',ui);
  const html=renderToStaticMarkup(React.createElement(SubitemSelection,{value:values,onChange:()=>writes++}));
  assert(html.includes('aria-checked="mixed"'));assert(html.includes('Duração planejada:'));assert(html.includes('15'));assert(html.includes('<details'));assert.equal(writes,0);
});
test('Hoje/Calendário snapshot view is compact by default and renders frozen names/duration without writes',()=>{
  const values=sub.initialSelection(fixture());let writes=0;
  const {PlanSubitems}=withStubs('components/planning/PlanSubitems.tsx',{'./SubitemSelection':{SubitemSelection:()=>null},'@/components/ui/button':{Button:'button'}});
  const html=renderToStaticMarkup(React.createElement(PlanSubitems,{items:values,total:125,onComplete:()=>writes++}));
  assert(html.startsWith('<details'));assert(!html.startsWith('<details open'));assert(html.includes('125'));assert(html.includes('grupos selecionados'));assert(html.includes('Sala'));assert.equal(writes,0);
});

test('definition editor adds arbitrary children and stable up/down ordering only in its draft',()=>{
  const {SubitemDefinitionEditor}=withStubs('components/banco-mestre/SubitemDefinitionEditor.tsx',{'@/components/ui/input':{Input:'input'},'@/components/ui/button':{Button:'button'}});
  let value=sub.emptyTree(),changes=0;
  const nodes=(n,p)=>!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...[n.props?.children].flat(Infinity).flatMap(c=>nodes(c,p))];
  const render=()=>SubitemDefinitionEditor({value,onChange:next=>{value=next;changes++;}});
  const button=text=>nodes(render(),n=>n.type==='button'&&n.props.children===text)[0];
  button('Adicionar subitem').props.onClick();value.items[0].name='A';
  button('Adicionar subitem').props.onClick();value.items[1].name='B';
  const before=changes;nodes(render(),n=>n.props?.['aria-label']==='Mover B para cima')[0].props.onClick();assert(changes>before);assert.equal(sub.treeIndex(value.items).roots[0].name,'B');
  button('Adicionar filho').props.onClick();const child=value.items.at(-1);assert.equal(child.parentId,value.items[1].id);
  const details=nodes(render(),n=>n.type==='details');assert(details.every(n=>n.props.onToggle===undefined));
});

test('paged tree reader rejects a mixed root revision instead of accepting a torn planning definition',async()=>{
  const root=crypto.randomUUID(),owner=crypto.randomUUID(),items=Array.from({length:501},(_,i)=>({...node('N '+i,1),root_activity_id:root,user_id:owner,parent_id:null,duration_minutes:1,sort_order:i,default_selected:true,root_revision:i===500?2:1,child_selection_mode:'all'}));
  let calls=0;
  const repo=load('lib/banco-mestre/data/repository.ts').createBancoMestreRepository({rpc:async(_name,args)=>{calls++;return {data:items.slice(args.p_offset,args.p_offset+500),error:null};}});
  await assert.rejects(()=>repo.listSubitems(),e=>e.kind==='Conflict');assert.equal(calls,2);
});
