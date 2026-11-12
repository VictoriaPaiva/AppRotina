/* eslint-disable @typescript-eslint/no-require-imports -- Node-only regression harness. */
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {load}=require('./helpers/load-typescript.cjs'),{withStubs}=require('./helpers/load-with-stubs.cjs');
const {renderToStaticMarkup}=require('react-dom/server');
const {quantitySnapshot,unitLabel,usesUnitChecks}=load('lib/activities/quantity.ts');
const {quantityPeriod,quantityTotals,quantityRange}=load('lib/planning/quantity-totals.ts');
const goal=(patch={})=>({goalId:randomUUID(),metric:'quantity',unit:'garrafas',target:2,period:'day',completed:0,checked:[],...patch});
test('quantity labels use known singulars or neutral fallback, with at most 20 unit checks',()=>{
 for(const [word,label] of [['garrafas','Garrafa'],['copos','Copo'],['vezes','Vez'],['execution','Vez'],['garafas','Item'],['litros desconhecidos','Item']])assert.equal(unitLabel(word),label);
 assert(usesUnitChecks(goal({target:20})));assert(!usesUnitChecks(goal({target:21})));assert(!usesUnitChecks(goal({target:2.5})));assert(!usesUnitChecks(goal({period:'week'})));
});
test('quantity snapshots reject inconsistent states, invalid IDs and invalid unit indices',()=>{
 const g=goal();assert.deepEqual(quantitySnapshot([g]),[g]);
 for(const patch of [{target:0},{completed:-1},{checked:[0]},{completed:2,checked:[0,0]},{completed:1,checked:[20]},{target:21,checked:[0]},{goalId:'bad'}])assert.throws(()=>quantitySnapshot([{...g,...patch}]));
});
test('daily quantity UI renders 2 friendly units; handlers only submit explicit changes; weekly is a counter',()=>{
 const {PlanQuantity}=withStubs('components/planning/PlanQuantity.tsx',{'@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'}});
 const calls=[],g=goal(),tree=PlanQuantity({goals:[g],onUnit:(...args)=>calls.push(args),onAmount(){}});
 const html=renderToStaticMarkup(tree);assert(html.includes('Garrafa 1')&&html.includes('Garrafa 2'));assert.equal((html.match(/type="checkbox"/g)||[]).length,2);assert.equal(calls.length,0);
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];nodes(tree).find(n=>n.type==='input').props.onChange({target:{checked:true}});assert.deepEqual(calls,[[g.goalId,0,true]]);
 const weekly=renderToStaticMarkup(PlanQuantity({goals:[{...g,period:'week',target:3}],totals:{[g.goalId]:2},onUnit(){},onAmount(){}}));assert(!weekly.includes('type="checkbox"'));assert(weekly.includes('Total no per')&&weekly.includes('2 de 3'));
});
test('period boundaries are civil Monday/Sunday and full months, including leap day/year',()=>{
 assert.deepEqual(quantityPeriod('2026-11-01','week'),{start:'2026-10-26',end:'2026-11-01'});assert.deepEqual(quantityPeriod('2026-11-02','week'),{start:'2026-11-02',end:'2026-11-08'});
 assert.deepEqual(quantityPeriod('2028-02-29','month'),{start:'2028-02-01',end:'2028-02-29'});assert.deepEqual(quantityPeriod('2026-12-31','month'),{start:'2026-12-01',end:'2026-12-31'});
});
test('period totals use each occurrence contribution once, separate owners of definitions/activity/periods and exact decimal addition',()=>{
 const g=goal({period:'week',target:3}),base={id:randomUUID(),activityId:randomUUID(),plannedDate:'2026-11-02',name:'Water',active:true};
 const row=(amount,date='2026-11-02')=>({...base,id:randomUUID(),plannedDate:date,quantity:[{...g,completed:amount}]});
 const first=row(0.1),second=row(0.2,'2026-11-03'),outside=row(9,'2026-11-09'),other={...row(99),activityId:randomUUID()};
 assert.equal(quantityTotals([first],[first,second,outside,other])[0].quantityTotals[g.goalId],0.3);assert.deepEqual(quantityRange([first]),{start:'2026-11-02',end:'2026-11-08'});
 assert.equal(quantityTotals([first],[first,second,other])[0].quantity[0].target,3);
});

test('counter keeps a protected draft, writes only on explicit save and rejects fractional count contributions',()=>{
 let value='0';const calls=[],dirty=[];
 const {PlanQuantity}=withStubs('components/planning/PlanQuantity.tsx',{
  react:{useState:()=>[value,next=>value=next]},'@/components/ui/button':{Button:'button'},'@/components/ui/input':{Input:'input'},
 });
 const g=goal({period:'week',metric:'count',target:3});
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
 const render=()=>{const tree=PlanQuantity({goals:[g],onUnit(){},onAmount:(...a)=>calls.push(a),onDirty:(...a)=>dirty.push(a)});const counter=nodes(tree).find(n=>typeof n.type==='function'&&n.type.name==='Counter');return counter.type(counter.props);};
 nodes(render()).find(n=>n.type==='input').props.onChange({target:{value:'1.5'}});assert.equal(calls.length,0);assert.deepEqual(dirty.at(-1),[g.goalId,true]);assert(nodes(render()).find(n=>n.type==='button').props.disabled);
 render().props.onSubmit({preventDefault(){}});assert.equal(calls.length,0);
 nodes(render()).find(n=>n.type==='input').props.onChange({target:{value:'2'}});render().props.onSubmit({preventDefault(){}});assert.deepEqual(calls,[[g.goalId,2]]);
});
