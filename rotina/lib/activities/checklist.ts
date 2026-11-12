import { fail, record, text, timestamp, uuid } from '@/lib/banco-mestre/data/validation';
export interface ChecklistItem {id:string;label:string}
export interface ChecklistCheck extends ChecklistItem {completedAt:string|null;retained?:boolean}
export function checklistItems(input:unknown):ChecklistItem[]{
  if(!Array.isArray(input))fail('checklist.items');
  const ids=new Set<string>();
  return input.map(value=>{const n=record(value,'checklist.item');
    if(Object.keys(n).some(k=>!['id','label'].includes(k)))fail('checklist.item');
    const id=uuid(n.id),label=text(n.label,'checklist.label').trim();
    if(ids.has(id)||Array.from(label).length>200)fail('checklist.item');ids.add(id);return {id,label};
  });
}
export function checklistSnapshot(input:unknown):ChecklistCheck[]{
  if(!Array.isArray(input))fail('checklist.snapshot');
  const nodes=input.map(n=>record(n,'checklist.check'));
  const items=checklistItems(nodes.map(({id,label})=>({id,label})));
  return items.map((n,i)=>({...n,completedAt:nodes[i].completedAt===null?null:timestamp(nodes[i].completedAt,'checklist.completedAt'),...(nodes[i].retained===true?{retained:true}:{})}));
}
