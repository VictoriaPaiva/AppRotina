'use client';
import type {ChecklistCheck} from '@/lib/activities/checklist';
export function PlanChecklist({items,disabled=false,onComplete}:{items:ChecklistCheck[];disabled?:boolean;onComplete?:(id:string,completed:boolean)=>void}){
  if(!items.length)return <p className="text-sm text-muted-foreground">Este planejamento foi salvo sem itens de checklist. Revise a definição no Banco Mestre e crie uma nova ocorrência para usar os itens atuais. O histórico desta ocorrência será mantido.</p>;
  const done=items.filter(n=>n.completedAt!==null).length;
  return <details open={items.length<=4} className="min-w-0 rounded-xl border p-3"><summary className="min-h-11 cursor-pointer py-2 font-medium">Checklist · {done} de {items.length} concluídos</summary><ul className="space-y-1">{items.map(n=><li key={n.id}><label className="flex min-h-11 cursor-pointer items-center gap-3 break-words"><input type="checkbox" className="h-5 w-5 shrink-0" checked={n.completedAt!==null} disabled={disabled||!onComplete} onChange={e=>onComplete?.(n.id,e.target.checked)} /><span className="min-w-0 break-words">{n.label}{n.retained?' (preservado nesta ocorr\u00eancia)':''}</span></label></li>)}</ul></details>;
}
