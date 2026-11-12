'use client';
import type {ChecklistItem} from '@/lib/activities/checklist';
import type {Dispatch, SetStateAction} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
export function ChecklistDefinitionEditor({value,onChange,text='',onTextChange,disabled=false,embedded=false}:{value:ChecklistItem[];onChange:Dispatch<SetStateAction<ChecklistItem[]>>;text?:string;onTextChange?:(text:string)=>void;disabled?:boolean;embedded?:boolean}){
  function add(){const label=text.trim();if(!label||Array.from(label).length>200)return;const item={id:crypto.randomUUID(),label};onChange(current=>[...current,item]);onTextChange?.('');}
  function move(id:string,direction:number){onChange(current=>{const next=[...current],from=next.findIndex(n=>n.id===id),to=from+direction;if(from<0||to<0||to>=next.length)return current;[next[from],next[to]]=[next[to],next[from]];return next;});}
  return <fieldset disabled={disabled} aria-label={embedded?'Itens da checklist':undefined} className="min-w-0 space-y-3 rounded-xl border p-4" data-field="checklistItems">
    {!embedded&&<legend className="px-2 font-semibold">Meta / Checklist</legend>}
    <p className="text-sm text-muted-foreground">Adicione os textos que aparecerão como checks em Hoje. Ocorrências já salvas mantêm seus próprios itens. A checklist não altera a duração ou a seleção dos subitens.</p>
    <label className="block space-y-2"><span>Novo item da checklist</span><Input aria-label="Novo item da checklist" value={text} maxLength={200} onChange={e=>onTextChange?.(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}} /></label>
    <Button type="button" variant="outline" className="min-h-11" disabled={!text.trim()} onClick={add}>Adicionar item</Button>
    {!value.length&&<p role="status" className="text-sm">Nenhum item adicionado.</p>}
    <ol className="space-y-3">{value.map((n,i)=><li key={n.id} className="min-w-0 space-y-2">
      <label className="block">Item {i+1}<Input aria-label={'Texto do item '+(i+1)} value={n.label} maxLength={200} onKeyDown={e=>{if(e.key==='Enter')e.preventDefault();}} onChange={e=>{const label=e.target.value;onChange(current=>current.map(x=>x.id===n.id?{...x,label}:x));}} /></label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={i===0} aria-label={'Mover item '+(i+1)+' para cima'} onClick={()=>move(n.id,-1)}>Subir</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={i===value.length-1} aria-label={'Mover item '+(i+1)+' para baixo'} onClick={()=>move(n.id,1)}>Descer</Button>
        <Button type="button" variant="destructive" className="min-h-11" aria-label={'Excluir item '+(i+1)+' da checklist'} onClick={()=>{if(window.confirm(`Excluir “${n.label}” da definição? Ocorrências já salvas permanecem intactas. A remoção será aplicada ao salvar.`))onChange(current=>current.filter(x=>x.id!==n.id));}}>Excluir item</Button>
      </div>
    </li>)}</ol>
  </fieldset>;
}
