/* eslint-disable @typescript-eslint/no-require-imports -- Node-only component regression. */
const {test}=require('node:test');const assert=require('node:assert/strict');const {withStubs}=require('./helpers/load-with-stubs.cjs');
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
test('queued add actions keep both new checklist items instead of replacing a stale array',()=>{
 const {ChecklistDefinitionEditor}=withStubs('components/banco-mestre/ChecklistDefinitionEditor.tsx',{'@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'}});
 let value=[];const queue=[];const tree=ChecklistDefinitionEditor({value,text:'Typed item',onChange:next=>queue.push(next)});const add=nodes(tree).find(n=>n.props?.children==='Adicionar item');add.props.onClick();add.props.onClick();for(const next of queue)value=typeof next==='function'?next(value):next;assert.equal(value.length,2);assert.notEqual(value[0].id,value[1].id);
});
test('typed checklist item is appended immediately; Enter adds locally and never submits; empty is ignored',()=>{
 const {ChecklistDefinitionEditor}=withStubs('components/banco-mestre/ChecklistDefinitionEditor.tsx',{'@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'}});
 let value=[],text='',prevented=0;const render=()=>ChecklistDefinitionEditor({value,text,onTextChange:n=>text=n,onChange:n=>value=typeof n==='function'?n(value):n});
 for(let i=0;i<4;i++){nodes(render()).find(n=>n.props?.['aria-label']==='Novo item da checklist').props.onChange({target:{value:'Item '+i}});const before=value.length;
 if(i===1)nodes(render()).find(n=>n.props?.['aria-label']==='Novo item da checklist').props.onKeyDown({key:'Enter',preventDefault(){prevented++;}});
 else {const add=nodes(render()).find(n=>n.props?.children==='Adicionar item');assert.equal(add.props.type,'button');add.props.onClick();}
 assert.equal(value.length,before+1);assert.equal(value[i].label,'Item '+i);assert.equal(text,'');}
 assert.equal(prevented,1);assert.equal(new Set(value.map(n=>n.id)).size,4);
 nodes(render()).find(n=>n.props?.children==='Adicionar item').props.onClick();assert.equal(value.length,4);
});
