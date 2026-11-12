/* eslint-disable @typescript-eslint/no-require-imports -- Repository regression without network. */
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {load}=require('./helpers/load-typescript.cjs');
test('completed reader fetches every page and uses São Paulo civil midnight bounds',async()=>{
 const owner=randomUUID(),activity=randomUUID(),calls=[],stamp='2026-11-04T12:00:00Z';
 const rows=Array.from({length:501},()=>({id:randomUUID(),user_id:owner,activity_id:activity,planned_date:'2026-11-03',completed_at:stamp,created_at:stamp,updated_at:stamp}));
 const client={from(table){assert.equal(table,'daily_plan_items');const filters=[];const query={select(){return query;},eq(...args){filters.push(['eq',...args]);return query;},gte(...args){filters.push(['gte',...args]);return query;},lt(...args){filters.push(['lt',...args]);return query;},order(){return query;},range(start,end){calls.push({filters,start,end});return Promise.resolve({data:rows.slice(start,end+1),error:null});}};return query;}};
 const repository=load('lib/planning/repository.ts').createPlanRepository(client,owner),result=await repository.listCompletedOn('2026-11-04');
 assert.equal(result.length,501);assert.equal(new Set(result.map(n=>n.id)).size,501);
 assert.deepEqual(calls.map(n=>[n.start,n.end]),[[0,499],[500,999]]);
 for(const call of calls)assert.deepEqual(call.filters,[['eq','user_id',owner],['gte','completed_at','2026-11-04 00:00:00 America/Sao_Paulo'],['lt','completed_at','2026-11-05 00:00:00 America/Sao_Paulo']]);
});
