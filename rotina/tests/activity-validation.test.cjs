/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test runner. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {load}=require('./helpers/load-typescript.cjs');
const {createDraft,buildBundle}=load('lib/banco-mestre/editor.ts');
const {MapperError,PersistenceError,saveValidationMessage}=load('lib/banco-mestre/data/errors.ts');
const area={id:randomUUID(),name:'Saúde',active:true};
const draft=()=>({...createDraft(),name:'Beber água',areaId:area.id,type:'checklistGoal',goals:[{id:randomUUID(),enabled:true,metric:'count',unit:'execution',minimum:'3',ideal:'',minimumHours:'',idealHours:'',period:'day',startsOn:'2026-11-18',endsOn:''}]});
const build=value=>buildBundle(value,[area],randomUUID(),'2026-11-18T12:00:00Z');
test('Beber água accepts count/day/3, optional ideal/end and unknown duration; legitimate validation remains',()=>{
 const valid=build(draft());assert(valid.ok);assert.equal(valid.bundle.goals[0].idealTarget,undefined);assert.equal(valid.bundle.goals[0].endsOn,undefined);assert.deepEqual(valid.bundle.activity.duration,{mode:'unknown'});
 for(const [field,value] of [['minimum','0'],['minimum','1.5'],['startsOn',''],['startsOn','2026-02-30'],['endsOn','2026-11-17'],['ideal','2']]){
  const valueDraft=draft();valueDraft.goals[0][field]=value;const result=build(valueDraft);assert(!result.ok);assert(result.errors['goals.0.'+field]);
 }
});
test('save errors only expose allowlisted guidance, never raw SQL or arbitrary mapper paths',()=>{
 assert.match(saveValidationMessage(new PersistenceError('Validation',new MapperError('goal.starts_on'))),/data inicial válida/);
 assert.match(saveValidationMessage(new MapperError('goal.ideal_target')),/ideal pode ficar vazio/);
 assert.match(saveValidationMessage({code:'23514',message:'SECRET SQL payload'}),/regras do item/);
 assert.equal(saveValidationMessage(new MapperError('secret.arbitrary')),undefined);
 assert.equal(saveValidationMessage({code:'XX000',message:'SECRET'}),undefined);
});
