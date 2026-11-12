'use client';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { treeIndex, initialSelection, subitemTotal, branchIds, removeSubitemBranch, type ActivityTree, type ActivitySubitem } from '@/lib/activities/subitems';
export function SubitemDefinitionEditor({value,onChange,disabled=false}:{value:ActivityTree;onChange:(tree:ActivityTree)=>void;disabled?:boolean}) {
  const tree=treeIndex(value.items);
  const defaults=initialSelection({...value,mode:'all'}),durations=new Map(defaults.map(n=>[n.id,n.plannedMinutes]));
  function patch(id:string,fields:Partial<ActivitySubitem>){onChange({...value,items:value.items.map(n=>n.id===id?{...n,...fields}:n)});}
  function remove(n:ActivitySubitem,scope:Element|null){
    if(disabled)return;
    const descendants=branchIds(value.items,n.id).size-1;
    const question=descendants?`Excluir “${n.name}” e seus ${descendants} subitens?`:`Excluir “${n.name}”?`;
    if(window.confirm(question+'\n\nA remoção do Banco Mestre será aplicada ao salvar a Activity. Planejamentos antigos já salvos permanecem íntegros pelos snapshots.')){
      onChange(removeSubitemBranch(value,n.id));
      // Activity can retain several hidden editors; focus only this visible one.
      if(typeof document!=='undefined')requestAnimationFrame(()=>scope?.querySelector<HTMLButtonElement>('[data-add-subitem]')?.focus());
    }
  }
  function add(parentId:string|null){const siblings=tree.children.get(parentId)??[],id=crypto.randomUUID();onChange({...value,items:[...value.items,{id,parentId,name:'Novo subitem',durationMinutes:15,sortOrder:Math.max(-1,...siblings.map(n=>n.sortOrder))+1,active:true,defaultSelected:true}]});if(typeof document!=='undefined')requestAnimationFrame(()=>{const input=document.getElementById('subitem-name-'+id);for(let parent=input?.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;input?.focus();});}
  function move(id:string,direction:number){const node=tree.nodes.get(id)!,siblings=[...(tree.children.get(node.parentId)??[])],from=siblings.findIndex(n=>n.id===id),to=from+direction;if(to<0||to>=siblings.length)return;[siblings[from],siblings[to]]=[siblings[to],siblings[from]];const order=new Map(siblings.map((n,i)=>[n.id,i]));onChange({...value,items:value.items.map(n=>order.has(n.id)?{...n,sortOrder:order.get(n.id)!}:n)});}
  function branch(n:ActivitySubitem,depth=0):ReactNode {
    const kids=tree.children.get(n.id)??[],siblings=tree.children.get(n.parentId)??[];
    return <li key={n.id} className="min-w-0 rounded-xl border p-3"><div className="flex flex-wrap items-center gap-3"><label className="min-w-0 flex-1">Nome<Input id={'subitem-name-'+n.id} aria-label={'Nome de '+n.name} value={n.name} onChange={e=>patch(n.id,{name:e.target.value})} /></label>{!kids.length&&<label>Minutos<Input type="number" min={1} step={1} value={n.durationMinutes} onChange={e=>{const minutes=Number(e.target.value);if(Number.isSafeInteger(minutes)&&minutes>0&&minutes<=2147483647)patch(n.id,{durationMinutes:minutes});}} className="w-24" /></label>}</div>
      <div className="flex flex-wrap items-center gap-3"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={n.active} onChange={e=>patch(n.id,{active:e.target.checked})} />Ativo</label>{value.mode==='custom'&&!kids.length&&<label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={n.defaultSelected} onChange={e=>patch(n.id,{defaultSelected:e.target.checked})} />Selecionar normalmente{kids.length>0?' (folhas têm sua própria seleção)':''}</label>}<Button type="button" variant="outline" className="min-h-11 min-w-11" onClick={()=>move(n.id,-1)} disabled={siblings[0]?.id===n.id} aria-label={'Mover '+n.name+' para cima'}>↑</Button><Button type="button" variant="outline" className="min-h-11 min-w-11" onClick={()=>move(n.id,1)} disabled={siblings.at(-1)?.id===n.id} aria-label={'Mover '+n.name+' para baixo'}>↓</Button><Button type="button" variant="outline" className="min-h-11 min-w-11" onClick={()=>add(n.id)}>Adicionar filho</Button></div>
      <Button type="button" variant="destructive" className="min-h-11 my-2" disabled={disabled} aria-label={'Excluir subitem '+n.name} onClick={event=>remove(n,event.currentTarget.closest('[data-field="subitems"]'))}>Excluir subitem</Button>
      {kids.length>0&&<details open><summary className="min-h-11 cursor-pointer py-2">{kids.length} subitens · {durations.get(n.id)??0} min ativos (duração derivada)</summary><ul className={depth<3?'space-y-3 border-l pl-3':'space-y-3'}>{kids.map(child=>branch(child,depth+1))}</ul></details>}</li>;
  }
  return <details className="min-w-0 rounded-xl border p-4" data-field="subitems"><summary className="min-h-11 cursor-pointer font-medium">Subitens (opcional) · {value.items.length}</summary><fieldset disabled={disabled} className="min-w-0 space-y-4 pt-3"><label>Seleção padrão<select aria-label="Seleção padrão dos subitens" value={value.mode} onChange={e=>onChange({...value,mode:e.target.value as ActivityTree['mode']})} className="min-h-11 w-full rounded-md border bg-background px-3"><option value="all">Todos</option><option value="none">Nenhum</option><option value="custom">Personalizada</option></select></label><p className="text-sm text-muted-foreground">Pais somam as folhas ativas, sem dupla contagem. Inativar um grupo deixa seus descendentes indisponíveis para novos planos; o histórico permanece.</p><p>Duração padrão dos subitens: {subitemTotal(initialSelection({...value,mode:'all'}))} min</p><ul className="space-y-3">{tree.roots.map(n=>branch(n))}</ul><Button type="button" variant="outline" className="min-h-11 min-w-11" data-add-subitem onClick={()=>add(null)}>Adicionar subitem</Button></fieldset></details>;
}
