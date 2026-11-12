import type {DailyPlanItem,PlanViewItem} from './contracts';
import type {QuantityGoal} from '@/lib/activities/quantity';
export function quantityPeriod(date:string,period:QuantityGoal['period']):{start:string;end:string}{
  if(period==='day')return {start:date,end:date};
  const d=new Date(date+'T12:00:00Z');
  if(period==='week'){d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return {start,end:d.toISOString().slice(0,10)};}
  d.setUTCDate(1);const start=d.toISOString().slice(0,10);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return {start,end:d.toISOString().slice(0,10)};
}
export function quantityRange(items:DailyPlanItem[]){
  const ranges=items.flatMap(n=>(n.quantity??[]).filter(g=>g.period!=='day').map(g=>quantityPeriod(n.plannedDate,g.period)));
  return ranges.length?{start:ranges.map(n=>n.start).sort()[0],end:ranges.map(n=>n.end).sort().at(-1)!}:null;
}
export function quantityTotals<T extends PlanViewItem>(items:T[],periodRows:DailyPlanItem[]):T[]{
  const sums=new Map<string,{units:bigint;scale:number}>();
  for(const n of periodRows)for(const g of n.quantity??[])if(g.period!=='day'){
    const key=n.activityId+'/'+g.goalId+'/'+g.period+'/'+quantityPeriod(n.plannedDate,g.period).start;
    const [mantissa,exponent='0']=String(g.completed).split('e'),fraction=mantissa.split('.')[1]?.length??0;
    let scale=fraction-Number(exponent),units=BigInt(mantissa.replace('.',''));
    if(scale<0){units*=BigInt(10)**BigInt(-scale);scale=0;}
    const prior=sums.get(key)??{units:BigInt(0),scale:0},shared=Math.max(scale,prior.scale);
    sums.set(key,{scale:shared,units:prior.units*BigInt(10)**BigInt(shared-prior.scale)+units*BigInt(10)**BigInt(shared-scale)});
  }
  return items.map(n=>!(n.quantity??[]).some(g=>g.period!=='day')?n:({...n,quantityTotals:Object.fromEntries((n.quantity??[]).filter(g=>g.period!=='day').map(g=>{const total=sums.get(n.activityId+'/'+g.goalId+'/'+g.period+'/'+quantityPeriod(n.plannedDate,g.period).start);return [g.goalId,total?Number(`${total.units}e-${total.scale}`):0];}))}));
}
