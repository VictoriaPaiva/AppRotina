import { bool, choice, fail, integer, record, text, timestamp, uuid } from '@/lib/banco-mestre/data/validation';
export type SelectionMode = 'all' | 'none' | 'custom';
export interface ActivitySubitem {id:string;parentId:string|null;name:string;durationMinutes:number;sortOrder:number;active:boolean;defaultSelected:boolean}
export interface ActivityTree {mode:SelectionMode;items:ActivitySubitem[]}
export interface PlanSubitem extends ActivitySubitem {selected:boolean;overrideMinutes:number|null;completedAt:string|null;plannedMinutes:number}
export interface SubitemSelection {id:string;selected:boolean;overrideMinutes:number|null}
export const emptyTree = ():ActivityTree=>({mode:'all',items:[]});
export function treeIndex<T extends {id:string;parentId:string|null;sortOrder:number}>(items:T[]) {
  const nodes=new Map(items.map(n=>[n.id,n])),children=new Map<string|null,T[]>();
  if(nodes.size!==items.length)fail('subitems.duplicate');
  for(const n of items) {
    if(n.parentId===n.id || (n.parentId!==null&&!nodes.has(n.parentId)))fail('subitems.parent');
    const group=children.get(n.parentId)??[];group.push(n);children.set(n.parentId,group);
  }
  for(const group of children.values())group.sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));
  const ordered:T[]=[],stack=[...(children.get(null)??[])].reverse();
  while(stack.length){const n=stack.pop()!;ordered.push(n);stack.push(...[...(children.get(n.id)??[])].reverse());}
  if(ordered.length!==items.length)fail('subitems.cycle');
  return {nodes,children,ordered,roots:children.get(null)??[]};
}
export function validateTree(input:unknown):ActivityTree {
  const v=record(input,'tree');if(Object.keys(v).some(k=>!['mode','items'].includes(k)))fail('tree');
  if(!Array.isArray(v.items))fail('tree.items');
  const items=v.items.map(value=>{
    const n=record(value,'subitem');if(Object.keys(n).some(k=>!['id','parentId','name','durationMinutes','sortOrder','active','defaultSelected'].includes(k)))fail('subitem');
    const name=text(n.name,'name');if(!name.trim()||Array.from(name).length>200)fail('name');
    return {id:uuid(n.id),parentId:n.parentId===null?null:uuid(n.parentId),name:name.trim(),durationMinutes:integer(n.durationMinutes,'minutes',1),sortOrder:integer(n.sortOrder,'order',0),active:bool(n.active,'active'),defaultSelected:bool(n.defaultSelected,'defaultSelected')};
  });
  treeIndex(items);return {mode:choice(v.mode,['all','none','custom'] as const,'mode'),items};
}
export function activeSubitems(items:ActivitySubitem[]) {
  const tree=treeIndex(items),active=new Set<string>();
  const enabled=tree.ordered.filter(n=>{const include=n.active&&(n.parentId===null||active.has(n.parentId));if(include)active.add(n.id);return include;});
  const relevant=new Set<string>();
  for(const n of [...enabled].reverse())if(!tree.children.has(n.id)||(tree.children.get(n.id)??[]).some(c=>relevant.has(c.id)))relevant.add(n.id);
  return enabled.filter(n=>relevant.has(n.id));
}
export function initialSelection(tree:ActivityTree):PlanSubitem[] {
  return normalizeSubitems(activeSubitems(tree.items).map(n=>({...n,selected:tree.mode==='all'||(tree.mode==='custom'&&n.defaultSelected),overrideMinutes:null,completedAt:null,plannedMinutes:0})));
}
export function normalizeSubitems(items:PlanSubitem[]):PlanSubitem[] {
  const tree=treeIndex(items),result=new Map<string,PlanSubitem>();
  for(const n of [...tree.ordered].reverse()) {
    const kids=(tree.children.get(n.id)??[]).map(c=>result.get(c.id)!);
    const selected=kids.length?kids.some(c=>c.selected):n.selected;
    const completedAt=selected?(kids.length?(kids.filter(c=>c.selected).every(c=>c.completedAt!==null)?n.completedAt??'complete':null):n.completedAt):null;
    const plannedMinutes=selected?(n.overrideMinutes??(kids.length?kids.reduce((s,c)=>s+c.plannedMinutes,0):n.durationMinutes)):0;
    if(!Number.isSafeInteger(plannedMinutes)||plannedMinutes>2147483647)fail('subitems.duration');
    result.set(n.id,{...n,selected,completedAt,plannedMinutes});
  }
  return tree.ordered.map(n=>result.get(n.id)!);
}
export function subitemTotal(items:PlanSubitem[]) {return normalizeSubitems(items).filter(n=>n.parentId===null).reduce((s,n)=>s+n.plannedMinutes,0);}
export function branchIds(items:ActivitySubitem[],id:string) {
  const tree=treeIndex(items),ids=new Set<string>(),stack=[id];
  while(stack.length){const next=stack.pop()!;ids.add(next);stack.push(...(tree.children.get(next)??[]).map(n=>n.id));}return ids;
}
export function removeSubitemBranch(tree:ActivityTree,id:string):ActivityTree {
  const ids=branchIds(tree.items,id);
  return {...tree,items:tree.items.filter(n=>!ids.has(n.id))};
}
export function validateSubitemDeletions(input:unknown,tree:ActivityTree):string[] {
  if(!Array.isArray(input))fail('deletedSubitemIds');
  const ids=input.map(id=>uuid(id,'deletedSubitemId'));
  const deleted=new Set(ids);
  if(deleted.size!==ids.length||tree.items.some(n=>deleted.has(n.id)||(n.parentId!==null&&deleted.has(n.parentId))))fail('deletedSubitemIds');
  return ids;
}
export function toggleBranch(items:PlanSubitem[],id:string,selected:boolean) {
  const ids=branchIds(items,id);return normalizeSubitems(items.map(n=>ids.has(n.id)?{...n,selected}:n));
}
export function selectionState(items:PlanSubitem[],id:string):boolean|'indeterminate' {
  const tree=treeIndex(items),ids=branchIds(items,id),leaves=items.filter(n=>ids.has(n.id)&&!tree.children.has(n.id));
  const selected=leaves.filter(n=>n.selected).length;return selected===0?false:selected===leaves.length?true:'indeterminate';
}
export function completionState(items:PlanSubitem[],id:string):boolean|'indeterminate' {
  const tree=treeIndex(items),ids=branchIds(items,id),leaves=items.filter(n=>n.selected&&ids.has(n.id)&&!tree.children.has(n.id));
  const done=leaves.filter(n=>n.completedAt!==null).length;return done===0?false:done===leaves.length?true:'indeterminate';
}
export function selectionPayload(items:PlanSubitem[]):SubitemSelection[] {return items.map(({id,selected,overrideMinutes})=>({id,selected,overrideMinutes})).sort((a,b)=>a.id.localeCompare(b.id));}
export function validateSelection(input:unknown):SubitemSelection[] {
  if(!Array.isArray(input))fail('selection');
  const seen=new Set<string>();
  return input.map(value=>{const v=record(value,'selection');if(Object.keys(v).some(k=>!['id','selected','overrideMinutes'].includes(k)))fail('selection');
    const id=uuid(v.id);if(seen.has(id))fail('selection.duplicate');seen.add(id);
    return {id,selected:bool(v.selected,'selected'),overrideMinutes:v.overrideMinutes===null?null:integer(v.overrideMinutes,'override',1)};});
}
export function snapshotSubitems(input:unknown):PlanSubitem[] {
  if(!Array.isArray(input))fail('subitem.snapshot');
  const nodes=input.map(v=>record(v,'node'));
  const base=validateTree({mode:'all',items:nodes.map(n=>({id:n.id,parentId:n.parentId,name:n.name,durationMinutes:n.durationMinutes,sortOrder:n.sortOrder,active:n.active,defaultSelected:n.defaultSelected}))});
  return base.items.map((n,i)=>({...n,selected:bool(nodes[i].selected,'selected'),overrideMinutes:nodes[i].overrideMinutes===null?null:integer(nodes[i].overrideMinutes,'override',1),completedAt:nodes[i].completedAt===null?null:timestamp(nodes[i].completedAt,'completedAt'),plannedMinutes:integer(nodes[i].plannedMinutes,'minutes',0)}));
}
