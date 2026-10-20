/* eslint-disable @typescript-eslint/no-require-imports -- Node-only data tests. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers/load-typescript.cjs');
const {owner}=require('./helpers/data-fixtures.cjs');
const {createAreaRepository}=load('lib/banco-mestre/data/area-repository.ts');
const {managedAreaFromDatabase}=load('lib/banco-mestre/data/area-mapper.ts');
const validation=load('lib/banco-mestre/data/area-validation.ts');
const {PersistenceError}=load('lib/banco-mestre/data/errors.ts');
const id='10000000-0000-4000-8000-000000000001';
const stamp='2026-10-20T10:00:00.123456+00:00';
const row={id,user_id:owner,name:'  Original  ',active:true,sort_position:12,created_at:stamp,updated_at:stamp};
const expected={name:row.name,active:true,sortPosition:12,updatedAt:stamp};
const kind=name=>error=>error instanceof PersistenceError&&error.kind===name;
function harness(responses=[]) {
  const calls=[];let index=0;
  const client={from(table){assert.equal(table,'areas');const call={table,filters:[],orders:[]};calls.push(call);
    const q={select(columns){call.columns=columns;return q;},insert(value){call.insert=value;return q;},update(value){call.update=value;return q;},
      eq(key,value){call.filters.push([key,value]);return q;},order(key){call.orders.push(key);return q;},range(start,end){call.range=[start,end];return q;},limit(value){call.limit=value;return q;},
      then(resolve,reject){const result=responses[index++];return Promise.resolve().then(()=>{if(result instanceof Error)throw result;return result??{data:[row],error:null};}).then(resolve,reject);}};return q;
  }};
  return {repo:createAreaRepository(client,owner),calls};
}
test('managed mapper and snapshot preserve original timestamp precision and snapshot name',()=>{
  assert.deepEqual(managedAreaFromDatabase(row),{id,name:row.name,active:true,sortPosition:12,updatedAt:stamp});
  assert.deepEqual(validation.areaSnapshot(expected),expected);
  assert.deepEqual(validation.createAreaInput({id,name:'  Saúde  '}),{id,name:'Saúde'});
  for(const broken of [{...row,updated_at:'invalid'},{...row,sort_position:-1},{...row,active:'true'}])assert.throws(()=>managedAreaFromDatabase(broken));
});
test('strict runtime inputs reject owner, order, extras and malformed snapshots before any query',async()=>{
  const {repo,calls}=harness();
  for(const input of [null,{}, {id,name:' '},{id:'bad',name:'OK'},{id,name:2},{id,name:'OK',user_id:owner},{id,name:'OK',sort_position:0},{id,name:'OK',sortPosition:0}])await assert.rejects(()=>repo.createArea(input),kind('Validation'));
  for(const input of [{id,name:'OK'},{id,name:'OK',expected:{...expected,extra:true}},{id,name:'OK',expected:{...expected,sortPosition:0.5}},{id,name:'OK',expected:{...expected,sortPosition:2147483648}},{id,name:'OK',expected:{...expected,updatedAt:'bad'}},{id,name:'OK',expected,user_id:owner}])await assert.rejects(()=>repo.renameArea(input),kind('Validation'));
  for(const active of ['false',null,0,undefined])await assert.rejects(()=>repo.setAreaActive({id,active,expected}),kind('Validation'));
  assert.equal(calls.length,0);
  assert.throws(()=>createAreaRepository({},''),kind('Unauthorized'));
});
test('create inserts only stable id, trusted owner and normalized name, without upsert/order writes',async()=>{
  const {repo,calls}=harness([{data:[{...row,name:'Saúde'}],error:null}]);
  const saved=await repo.createArea({id,name:' Saúde '});assert.equal(saved.name,'Saúde');
  assert.deepEqual(calls[0].insert,{id,user_id:owner,name:'Saúde'});assert.equal(calls.length,1);
  const conflict=harness([{data:null,error:{code:'23505',message:'private owner details'}}]);
  await assert.rejects(()=>conflict.repo.createArea({id,name:'Duplicate'}),e=>kind('Conflict')(e)&&!e.message.includes('private'));
  assert.deepEqual(Object.keys(repo).sort(),['createArea','listManagedAreas','renameArea','setAreaActive']);
});
test('rename and explicit active state use one conditional UPDATE with the entire original snapshot',async()=>{
  for(const [method,input,patch] of [['renameArea',{id,name:' New ',expected},{name:'New'}],['setAreaActive',{id,active:false,expected},{active:false}],['setAreaActive',{id,active:true,expected},{active:true}]]) {
    const {repo,calls}=harness();await repo[method](input);
    assert.equal(calls.length,1);assert.deepEqual(calls[0].update,patch);
    assert.deepEqual(calls[0].filters,[['id',id],['user_id',owner],['name',row.name],['active',true],['sort_position',12],['updated_at',stamp]]);
  }
});
test('zero-row conditional update safely distinguishes visible Conflict from unavailable NotFound without retry',async()=>{
  for(const [visible,errorKind] of [[[{id}],'Conflict'],[[],'NotFound']]) {
    const {repo,calls}=harness([{data:[],error:null},{data:visible,error:null}]);
    await assert.rejects(()=>repo.renameArea({id,name:'Unsaved',expected}),kind(errorKind));
    assert.equal(calls.length,2);assert(calls[0].update);assert(!calls[1].update);
    assert.deepEqual(calls[1].filters,[['id',id],['user_id',owner]]);assert.equal(calls[1].columns,'id');
  }
});
test('listing paginates own active/inactive areas with deterministic existing order',async()=>{
  const {repo,calls}=harness([{data:Array.from({length:500},()=>row),error:null},{data:[{...row,active:false}],error:null}]);
  const areas=await repo.listManagedAreas();assert.equal(areas.length,501);assert.equal(areas[500].active,false);
  assert.deepEqual(calls.map(c=>c.range),[[0,499],[500,999]]);
  for(const call of calls){assert.deepEqual(call.orders,['sort_position','id']);assert.deepEqual(call.filters,[['user_id',owner]]);assert(!call.columns.includes('*'));}
});
test('SQL, network, lookup and malformed-response errors remain safe persistence errors',async()=>{
  for(const [code,errorKind] of [['42501','Unauthorized'],['23514','Validation'],['40001','Conflict'],['XX000','Unknown']]) {
    await assert.rejects(()=>harness([{data:null,error:{code,message:'private SQL'}}]).repo.setAreaActive({id,active:false,expected}),e=>kind(errorKind)(e)&&!e.message.includes('private'));
  }
  await assert.rejects(()=>harness([new Error('private network')]).repo.listManagedAreas(),kind('Unknown'));
  await assert.rejects(()=>harness([{data:[],error:null},{data:null,error:{code:'42501'}}]).repo.renameArea({id,name:'X',expected}),kind('Unauthorized'));
  for(const data of [null,[],[{}],[{...row,user_id:'00000000-0000-4000-8000-000000000099'}]])await assert.rejects(()=>harness([{data,error:null}]).repo.createArea({id,name:'X'}),kind('Validation'));
});

test('all public commands reject injected ownership, timestamps and order, without issuing SQL',async()=>{
  const {repo,calls}=harness();
  const commands=[['createArea',{id,name:'Valid'}],['renameArea',{id,name:'Valid',expected}],['setAreaActive',{id,active:false,expected}]];
  const protectedFields={user_id:owner,userId:owner,created_at:stamp,updated_at:stamp,createdAt:stamp,updatedAt:stamp,sort_position:99,sortPosition:99};
  for(const [method,input] of commands) {
    for(const [field,value] of Object.entries(protectedFields))await assert.rejects(()=>repo[method]({...input,[field]:value}),kind('Validation'));
    await assert.rejects(()=>repo[method]({...input,id:'not-a-uuid'}),kind('Validation'));
  }
  for(const method of ['createArea','renameArea']) {
    for(const name of ['', ' \t\n '])await assert.rejects(()=>repo[method]({id,name,...(method==='renameArea'?{expected}:{})}),kind('Validation'));
  }
  assert.equal(calls.length,0);
});

test('NotFound is identical and safe for missing/invisible data and no DELETE/reorder API exists',async()=>{
  const messages=[];
  for(const method of ['renameArea','setAreaActive']) {
    const {repo,calls}=harness([{data:[],error:null},{data:[],error:null}]);
    await assert.rejects(()=>repo[method]({id,expected,...(method==='renameArea'?{name:'Pending'}:{active:false})}),error=>{
      messages.push(error.message);assert(kind('NotFound')(error));assert(!error.message.includes(id));assert(!error.message.includes(owner));return true;
    });
    assert.equal(calls.length,2);
    assert.deepEqual(Object.keys(repo).sort(),['createArea','listManagedAreas','renameArea','setAreaActive']);
    for(const forbidden of ['delete','deleteArea','removeArea','reorder','updateSortPosition','setAreaOrder'])assert.equal(repo[forbidden],undefined);
  }
  assert.equal(messages[0],messages[1]);
});
