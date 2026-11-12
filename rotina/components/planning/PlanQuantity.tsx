'use client';
import {useState} from 'react';
import {type QuantityGoal,unitLabel,usesUnitChecks} from '@/lib/activities/quantity';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useDraftProtection} from '@/lib/forms/draft-protection';
const periods={day:'dia',week:'semana',month:'mês'};
function Counter({goal,disabled,onSave,onDirty}:{goal:QuantityGoal;disabled:boolean;onSave:(amount:number)=>void;onDirty?:(dirty:boolean)=>void}){
  const [value,setValue]=useState(String(goal.completed));const dirty=value!==String(goal.completed);
  useDraftProtection(dirty,disabled);
  const amount=Number(value),valid=value.trim()!==''&&Number.isFinite(amount)&&amount>=0&&amount<=9007199254740991&&(goal.metric!=='count'||Number.isInteger(amount));
  return <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();if(valid)onSave(amount);}}><label className="min-w-0">{goal.period==='day'?'Quantidade realizada':'Contribuição desta ocorrência'}<Input aria-label="Quantidade realizada" className="min-h-11" type="number" min={0} max={9007199254740991} step={goal.metric==='count'?1:'any'} disabled={disabled} value={value} onChange={e=>{setValue(e.target.value);onDirty?.(e.target.value!==String(goal.completed));}} /></label><Button type="submit" className="min-h-11" variant="outline" disabled={disabled||!dirty||!valid}>Salvar quantidade</Button></form>;
}
export function PlanQuantity({goals,totals={},disabled=false,onUnit,onAmount,onDirty}:{goals:QuantityGoal[];totals?:Record<string,number>;disabled?:boolean;onUnit:(goalId:string,index:number,completed:boolean)=>void;onAmount:(goalId:string,amount:number)=>void;onDirty?:(goalId:string,dirty:boolean)=>void}){
  return <div className="space-y-3">{goals.map(goal=><section key={goal.goalId} className="min-w-0 space-y-2 rounded-xl border p-3">
    <p className="font-medium">Meta: {goal.target.toLocaleString('pt-BR',{maximumSignificantDigits:17})} {goal.unit==='execution'?'vezes':goal.unit==='minute'?'minutos':goal.unit} por {periods[goal.period]}</p>
    {(goal.retained||goal.completed>goal.target||goal.checked.some(i=>i>=goal.target))&&<p className="text-sm text-muted-foreground">Execução registrada preservada após alteração da meta. Unidades já realizadas continuam contando para o alvo.</p>}
    {goal.archived?<p>Execução preservada: {goal.completed.toLocaleString('pt-BR')}</p>:goal.period==='day'?<p aria-live="polite">{goal.completed.toLocaleString('pt-BR',{maximumSignificantDigits:17})} de {goal.target.toLocaleString('pt-BR',{maximumSignificantDigits:17})} concluídas</p>:<><p>Total no período: {(totals[goal.goalId]??0).toLocaleString('pt-BR',{maximumSignificantDigits:17})} de {goal.target.toLocaleString('pt-BR',{maximumSignificantDigits:17})}</p><p>Contribuição desta ocorrência: {goal.completed.toLocaleString('pt-BR',{maximumSignificantDigits:17})}</p></>}
    {goal.archived?<p className="text-sm">Definição anterior preservada; sem novas unidades obrigatórias.</p>:usesUnitChecks(goal)?<details open={goal.target<=4}><summary className="min-h-11 cursor-pointer py-2">Unidades</summary><ul>{Array.from({length:Math.max(goal.target,...goal.checked.map(i=>i+1))},(_,i)=>i).filter(i=>goal.checked.includes(i)||(i<goal.target&&goal.completed<goal.target)).map(i=><li key={i}><label className="flex min-h-11 cursor-pointer items-center gap-3 break-words"><input type="checkbox" className="h-5 w-5 shrink-0" checked={goal.checked.includes(i)} disabled={disabled} onChange={e=>onUnit(goal.goalId,i,e.target.checked)} /><span>{unitLabel(goal.unit)} {i+1}{i>=goal.target?' (execu\u00e7\u00e3o preservada)':''}</span></label></li>)}</ul></details>:<Counter goal={goal} disabled={disabled} onSave={amount=>onAmount(goal.goalId,amount)} onDirty={dirty=>onDirty?.(goal.goalId,dirty)} />}
  </section>)}</div>;
}
