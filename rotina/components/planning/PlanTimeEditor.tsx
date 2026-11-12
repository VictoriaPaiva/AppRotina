'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useDraftProtection} from '@/lib/forms/draft-protection';
export function PlanTimeEditor({id,value,disabled,onSave,onDirty}:{id:string;value:string|null;disabled:boolean;onSave:(time:string|null)=>void;onDirty?:(dirty:boolean)=>void}){
  const [time,setTime]=useState(value??'');const dirty=time!==(value??'');
  useDraftProtection(dirty,disabled);
  return <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();onSave(time||null);}}><label className="min-w-0 space-y-1" htmlFor={'plan-time-'+id}>Horário aproximado<Input id={'plan-time-'+id} type="time" step={60} value={time} disabled={disabled} onChange={e=>{setTime(e.target.value);onDirty?.(e.target.value!==(value??''));}} /></label><Button type="submit" variant="outline" className="min-h-11" disabled={disabled||!dirty}>Salvar horário</Button><Button type="button" variant="outline" className="min-h-11" disabled={disabled||!time} onClick={()=>{setTime('');onDirty?.(value!==null);}}>Remover horário</Button></form>;
}
