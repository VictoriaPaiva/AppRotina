import pg from 'pg';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {installSaveV05Repair,verifySaveV05Repair} from '../helpers/save-v05-repair.mjs';
const port=Number(process.env.ROTINA_PG_PORT),data=process.env.ROTINA_PG_DATA;
if(!Number.isInteger(port)||port<1024||!data||!resolve(data).startsWith(resolve('node_modules/.cache/rotina-pg-concurrency')))throw Error('Use disposable localhost runner.');

test('PostgreSQL 17: reproduce partial RPC patch and repair creation/sync without changing permissions',async()=>{
  const client=new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:5000});
  await client.connect();
  try {
    const info=(await client.query("select current_setting('data_directory') d,current_setting('listen_addresses') h,current_setting('server_version_num') v")).rows[0];
    assert.equal(await realpath(info.d),await realpath(data));assert.equal(info.h,'127.0.0.1');assert.equal(Math.floor(Number(info.v)/10000),17);
    const db={query:(...args)=>client.query(...args),exec:sql=>client.query(sql)};
    const installed=await installSaveV05Repair(db);
    await verifySaveV05Repair(db,installed);
  }finally{await client.end();}
});
