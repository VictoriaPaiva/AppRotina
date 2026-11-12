'use client';
import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { minutesLabel } from '@/lib/banco-mestre/presentation';
import { treeIndex, toggleBranch, selectionState, normalizeSubitems, subitemTotal, type PlanSubitem } from '@/lib/activities/subitems';
export function SubitemSelection({value,onChange,disabled=false}:{value:PlanSubitem[];onChange:(value:PlanSubitem[])=>void;disabled?:boolean}) {
  const tree=treeIndex(value);
  const defaults=new Map(normalizeSubitems(value.map(n=>({...n,selected:true,overrideMinutes:null}))).map(n=>[n.id,n.plannedMinutes]));
  function branch(n:PlanSubitem,depth=0):ReactNode {
    const state=selectionState(value,n.id),kids=tree.children.get(n.id)??[];
    const shownMinutes=n.selected?n.plannedMinutes:(n.overrideMinutes??defaults.get(n.id));
    return <li key={n.id} className="min-w-0 space-y-2"><div className="flex min-h-11 flex-wrap items-center gap-3"><Checkbox className="h-11 w-11 shrink-0" aria-label={'Selecionar '+n.name} checked={state} disabled={disabled} onCheckedChange={checked=>onChange(toggleBranch(value,n.id,checked!==false))} /><span className="min-w-[8rem] flex-1 break-words">{n.name} — {shownMinutes} min{state==='indeterminate'?' (seleção parcial)':''}</span><label className="text-sm">Duração nesta ocorrência<Input aria-label={'Minutos nesta ocorrência: '+n.name} type="number" min={1} step={1} placeholder="Padrão" value={n.overrideMinutes??''} disabled={disabled} className="min-h-11 w-28" onChange={e=>{const minutes=e.target.value===''?null:Number(e.target.value);if(minutes!==null&&(!Number.isSafeInteger(minutes)||minutes<1||minutes>2147483647))return;onChange(normalizeSubitems(value.map(item=>item.id===n.id?{...item,overrideMinutes:minutes}:item)));}} /></label></div>{kids.length>0&&<details open><summary className="min-h-11 cursor-pointer py-2">{kids.length} subitens</summary><ul className={depth<3?'space-y-3 border-l pl-3':'space-y-3'}>{kids.map(k=>branch(k,depth+1))}</ul></details>}</li>;
  }
  return <div className="min-w-0 space-y-3"><p className="text-sm text-muted-foreground">A seleção e a duração alteram somente esta ocorrência. Um override no grupo substitui a duração de sua ramificação.</p><ul className="space-y-3">{tree.roots.map(n=>branch(n))}</ul><p role="status" aria-live="polite" className="font-medium">Duração planejada: {minutesLabel(subitemTotal(value))}</p></div>;
}
