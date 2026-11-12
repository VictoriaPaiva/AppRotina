import {choice,fail,integer,parseDatabaseNumber,record,text,uuid} from '@/lib/banco-mestre/data/validation';
export interface QuantityGoal {goalId:string;metric:'count'|'quantity'|'duration';unit:string;target:number;period:'day'|'week'|'month';completed:number;checked:number[];retained?:boolean;archived?:boolean}
export const UNIT_CHECK_LIMIT=20;
export function usesUnitChecks(goal:QuantityGoal){return goal.period==='day'&&Number.isInteger(goal.target)&&goal.target<=UNIT_CHECK_LIMIT&&goal.completed===goal.checked.length;}
export function unitLabel(unit:string){
  const known:Record<string,string>={execution:'Vez',vez:'Vez',vezes:'Vez',garrafa:'Garrafa',garrafas:'Garrafa',copo:'Copo',copos:'Copo',capítulo:'Capítulo',capítulos:'Capítulo',minute:'Minuto',minuto:'Minuto',minutos:'Minuto'};
  return known[unit.trim().toLocaleLowerCase('pt-BR')]??'Item';
}
export function quantitySnapshot(input:unknown):QuantityGoal[]{
  if(!Array.isArray(input))fail('quantity.snapshot');const ids=new Set<string>();
  return input.map(v=>{const n=record(v,'quantity.goal'),goalId=uuid(n.goalId);
    if(ids.has(goalId)||Object.keys(n).some(k=>!['goalId','metric','unit','target','period','completed','checked','retained','archived'].includes(k)))fail('quantity.goal');ids.add(goalId);
    const target=parseDatabaseNumber(n.target,'quantity.target',false,9007199254740991),completed=parseDatabaseNumber(n.completed,'quantity.completed',false,9007199254740991);
    if(target<=0||completed<0)fail('quantity.amount');
    const goal:QuantityGoal={goalId,metric:choice(n.metric,['count','quantity','duration'],'quantity.metric'),unit:text(n.unit,'quantity.unit'),target,period:choice(n.period,['day','week','month'],'quantity.period'),completed,checked:[]};
    if(goal.metric==='count'&&(!Number.isInteger(target)||!Number.isInteger(completed)))fail('quantity.count');
    if(!Array.isArray(n.checked))fail('quantity.checked');goal.checked=n.checked.map(v=>integer(v,'quantity.index',0,UNIT_CHECK_LIMIT-1));
    if(new Set(goal.checked).size!==goal.checked.length||completed<goal.checked.length)fail('quantity.checked');
    if(n.retained!==undefined){if(n.retained!==true)fail('quantity.retained');goal.retained=true;}if(n.archived!==undefined){if(n.archived!==true)fail('quantity.archived');goal.archived=true;}return goal;
  });
}
