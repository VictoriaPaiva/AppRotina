/* eslint-disable @typescript-eslint/no-require-imports -- Testes Node sem backend remoto. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers/load-typescript.cjs');
const {fixture,databaseResult,owner}=require('./helpers/data-fixtures.cjs');
const {createBancoMestreRepository}=load('lib/banco-mestre/data/repository.ts');
const {aggregateToRpc}=load('lib/banco-mestre/data/mapper.ts');
const {PersistenceError,toPersistenceError}=load('lib/banco-mestre/data/errors.ts');
function fake(options={}) {
  const calls=[];
  const client={from(table){
    const query={select(columns){calls.push(['select',table,columns]);return query;},order(col,params){calls.push(['order',table,col,params]);return query;},async range(start,end){calls.push(['range',table,start,end]);if(options.throw)throw options.throw;return options.list?options.list(table,start,end):{data:options.rows??[],error:options.error??null};}};
    return query;
  },async rpc(name,args){calls.push(['rpc',name,args]);if(options.throw)throw options.throw;return {data:options.data??null,error:options.error??null};}};
  return {repo:createBancoMestreRepository(client),calls};
}
const isError=kind=>e=>e instanceof PersistenceError&&e.kind===kind;
test('repository lista somente base sem N+1/config; pagina além do limite API',async()=>{
  const b=fixture('academia'),row=databaseResult(aggregateToRpc(b),b).activity;
  const {repo,calls}=fake({list:(_,start)=>({data:start===0?Array.from({length:500},()=>row):[row],error:null})});
  const result=await repo.listActivities();
  assert.equal(result.length,501);assert(!('config' in result[0].activity));assert.equal(result[0].revision,1);
  assert.equal(calls.filter(c=>c[0]==='rpc').length,0);assert.equal(calls.filter(c=>c[0]==='range').length,2);
  assert(calls.filter(c=>c[0]==='select').every(c=>c[1]==='activities'&&!c[2].includes('*')&&!c[2].includes('goals')));
});
test('repository lista áreas, incluindo inativas e ordem determinística',async()=>{
  const b=fixture('academia');const row={id:b.activity.areaId,user_id:owner,name:'Área',active:false,sort_position:0,created_at:b.activity.createdAt,updated_at:b.activity.updatedAt};
  const {repo,calls}=fake({rows:[row]});
  assert.deepEqual(await repo.listAreas(),[{id:row.id,name:'Área',active:false}]);
  assert.deepEqual(calls.filter(c=>c[0]==='order').map(c=>c[2]),['sort_position','id']);
});
test('get chama somente RPC pública e retorna bundle + revision; null vira NotFound',async()=>{
  const b=fixture('dentista'),data=databaseResult(aggregateToRpc(b),b,8);
  const {repo,calls}=fake({data});
  assert.deepEqual(await repo.getActivity(b.activity.id),{bundle:b,revision:8});
  assert.deepEqual(calls,[['rpc','get_activity_aggregate',{p_activity_id:b.activity.id}]]);
  await assert.rejects(()=>fake().repo.getActivity(b.activity.id),isError('NotFound'));
  const invalid=fake(); await assert.rejects(()=>invalid.repo.getActivity('dentista'),isError('Validation'));assert.equal(invalid.calls.length,0);
});
test('save usa uma única RPC com snapshot completo e expectedRevision explícita',async()=>{
  const b=fixture('agua'),data=databaseResult(aggregateToRpc(b,7),b,10);
  const {repo,calls}=fake({data});
  assert.deepEqual(await repo.saveActivity(b,7),{bundle:b,revision:10});
  assert.equal(calls.length,1);assert.equal(calls[0][1],'save_activity_aggregate');
  assert.equal(calls[0][2].p_expected_revision,7);assert.equal(calls[0][2].p_relations.goals[0].id,b.goals[0].id);
  const created=fake({data}); await created.repo.saveActivity(b);assert.equal(Object.hasOwn(created.calls[0][2],'p_expected_revision'),false);
});
test('SQLSTATE, auth e mapper errors viram mensagens seguras com cause técnico preservado',async()=>{
  const b=fixture('academia');
  for(const [code,kind] of [['PT409','Conflict'],['40001','Conflict'],['40P01','Conflict'],['42501','Unauthorized'],['PGRST301','Unauthorized'],['23514','Validation'],['23503','Validation'],['22023','Validation'],['XX000','Unknown'],['PGRST116','Unknown']]) {
    const error={code,message:'constraint activities_goal private-id',details:'SQL internals'};
    const {repo}=fake({error});
    await assert.rejects(()=>repo.saveActivity(b),e=>isError(kind)(e)&&e.cause===error&&!e.message.includes(code)&&!e.message.includes('activities'));
  }
  const broken=databaseResult(aggregateToRpc(b),b);broken.activity.duration_mode='broken';
  await assert.rejects(()=>fake({data:broken}).repo.getActivity(b.activity.id),e=>isError('Validation')(e)&&e.cause.name==='MapperError');
  for(const method of ['listActivities','listAreas']) {
    await assert.rejects(()=>fake({rows:[{}]}).repo[method](),isError('Validation'));
    await assert.rejects(()=>fake({error:{code:'42501'}}).repo[method](),isError('Unauthorized'));
  }
});
test('falha de rede, payload inválido e retorno inválido não são ocultados',async()=>{
  const b=fixture('academia'),network=new Error('Network failed');
  await assert.rejects(()=>fake({throw:network}).repo.saveActivity(b),e=>isError('Unknown')(e)&&e.cause===network);
  await assert.rejects(()=>fake().repo.saveActivity(b),isError('Validation'));
  const invalid=fake();b.activity.duration={mode:'fixed',minutes:30.5};
  await assert.rejects(()=>invalid.repo.saveActivity(b),isError('Validation'));assert.equal(invalid.calls.length,0);
  assert.equal(toPersistenceError(new PersistenceError('NotFound')).kind,'NotFound');
});
