'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useDraftProtection } from '@/lib/forms/draft-protection';
import { treeIndex, selectionPayload, completionState, type SubitemSelection as Configuration } from '@/lib/activities/subitems';
import type { PlanSubitem } from '@/lib/activities/subitems';
import { SubitemSelection } from './SubitemSelection';
import { minutesLabel } from '@/lib/banco-mestre/presentation';
export function PlanSubitems({items,total,onConfigure,onComplete,onDraftChange,disabled=false}:{items:PlanSubitem[];total:number;disabled?:boolean;onDraftChange?:(dirty:boolean)=>void;onConfigure?:(configuration:Configuration[])=>void;onComplete?:(id:string,completed:boolean)=>void}) {
  const [draft,setDraft]=useState(items),[editing,setEditing]=useState(false);
  const dirty=JSON.stringify(selectionPayload(draft))!==JSON.stringify(selectionPayload(items));
  useDraftProtection(dirty,disabled&&editing);
  useEffect(()=>{onDraftChange?.(dirty);return()=>onDraftChange?.(false);},[dirty,onDraftChange]);
  const tree=treeIndex(items),groups=tree.roots.filter(n=>n.selected).length;
  function branch(n:PlanSubitem,depth=0):ReactNode {
    if(!n.selected)return null;const kids=(tree.children.get(n.id)??[]).filter(k=>k.selected);
    const partial=completionState(items,n.id)==='indeterminate';
    return <li key={n.id} className="min-w-0"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" ref={element=>{if(element)element.indeterminate=partial;}} aria-checked={partial?'mixed':n.completedAt!==null} checked={n.completedAt!==null} disabled={disabled||!onComplete} onChange={e=>onComplete?.(n.id,e.target.checked)} /><span className="break-words">{n.name} — {n.plannedMinutes} min{partial?' (parcial)':''}</span></label>{kids.length>0&&<ul className={depth<3?'border-l pl-3':' '}>{kids.map(k=>branch(k,depth+1))}</ul>}</li>;
  }
  return <details className="min-w-0 rounded-xl border p-3"><summary title={total+' min'} className="min-h-11 cursor-pointer py-2">{minutesLabel(total)} · {groups} grupos selecionados · Subitens</summary><ul>{tree.roots.map(n=>branch(n))}</ul>{onConfigure&&<Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={()=>setEditing(!editing)}>{editing?'Fechar configuração':'Revisar seleção e duração'}</Button>}{editing&&<div className="space-y-3 pt-3"><SubitemSelection value={draft} onChange={setDraft} disabled={disabled} /><Button type="button" className="min-h-11" disabled={disabled||!dirty} onClick={()=>onConfigure?.(selectionPayload(draft))}>Salvar configuração da ocorrência</Button></div>}</details>;
}
