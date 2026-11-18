import pg from 'pg';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {A} from '../helpers/account-fixtures.mjs';
import {calendarStandaloneRegression,standaloneRepository} from '../helpers/calendar-standalone.mjs';
const port=Number(process.env.ROTINA_PG_PORT),data=process.env.ROTINA_PG_DATA;
if(!Number.isInteger(port)||port<1024||!data||!resolve(data).startsWith(resolve('node_modules/.cache/rotina-pg-concurrency')))throw Error('Use disposable localhost runner.');
test('PostgreSQL 17 avulsos: shared guard, independent-session insertion/order and one completion winner',async()=>{
  const clients=Array.from({length:3},()=>new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'}));
  await Promise.all(clients.map(c=>c.connect()));
  const adapt=c=>({query:(...args)=>c.query(...args),exec:sql=>c.query(sql)});
  try{
    const info=(await clients[0].query("select current_setting('data_directory') d,current_setting('listen_addresses') h,current_setting('server_version_num') v")).rows[0];
    assert.equal(await realpath(info.d),await realpath(data));assert.equal(info.h,'127.0.0.1');assert.equal(Math.floor(Number(info.v)/10000),17);
    const fixture=await calendarStandaloneRegression(adapt(clients[0]));
    for(const c of clients.slice(1)){await c.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);await c.query('set role authenticated');}
    const repos=clients.slice(1).map(c=>standaloneRepository(adapt(c)));
    const rows=await Promise.all(repos.map(repo=>repo.createStandalone(fixture.input({plannedDate:fixture.day(10)}))));
    const ordered=await repos[0].listByDate(fixture.day(10));assert.deepEqual(ordered.map(p=>p.sortOrder),[0,1]);
    const target=ordered.find(p=>p.id===rows[1].id);const input={id:target.id,expected:{plannedDate:target.plannedDate,completedAt:null,updatedAt:target.updatedAt},completed:true};
    const results=await Promise.allSettled(repos.map(repo=>repo.setCompleted(input)));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.find(r=>r.status==='rejected').reason.kind,'Conflict');
  }finally{await Promise.all(clients.map(c=>c.end()));}
});
