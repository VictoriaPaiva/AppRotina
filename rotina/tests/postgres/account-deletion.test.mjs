import pg from 'pg';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {A,B,authFixture,seedAccount,snapshot} from '../helpers/account-fixtures.mjs';
const port=Number(process.env.ROTINA_PG_PORT),data=process.env.ROTINA_PG_DATA;
if(!Number.isInteger(port)||port<1024||!data||!resolve(data).startsWith(resolve('node_modules/.cache/rotina-pg-concurrency')))throw Error('Use the disposable localhost runner.');
test('PostgreSQL 17: managed Auth role cascades all data atomically, including RESTRICT/cycles; B sessions preserved',async()=>{
  const client=new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:5000});
  await client.connect();
  try {
    const info=(await client.query("select current_setting('data_directory') d,current_setting('listen_addresses') h,current_setting('server_version_num') v")).rows[0];
    assert.equal(await realpath(info.d),await realpath(data));assert.equal(info.h,'127.0.0.1');assert.equal(Math.floor(Number(info.v)/10000),17);
    await client.query(authFixture);for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await client.query(await readFile('supabase/migrations/'+f,'utf8'));
    await seedAccount(client,A);await seedAccount(client,B);
    await client.query('create role managed_auth_owner nologin;grant usage on schema auth to managed_auth_owner;alter table auth.users owner to managed_auth_owner');
    const beforeA=await snapshot(client,A),beforeB=await snapshot(client,B);
    await client.query("create function public.reject_test_deletion() returns trigger language plpgsql as $$begin raise exception 'injected';end$$;create trigger reject_test_deletion before delete on ideas for each row execute function public.reject_test_deletion()");
    await client.query('set role managed_auth_owner');await assert.rejects(()=>client.query('delete from auth.users where id=$1',[A]),/injected/);await client.query('reset role');
    assert.deepEqual(await snapshot(client,A),beforeA);assert.deepEqual(await snapshot(client,B),beforeB);
    await client.query('drop trigger reject_test_deletion on ideas;drop function public.reject_test_deletion()');
    await client.query('set role managed_auth_owner');await client.query('delete from auth.users where id=$1',[A]);await client.query('reset role');
    for(const [table,rows] of Object.entries(await snapshot(client,A)))assert.deepEqual(rows,[],table);
    assert.deepEqual(await snapshot(client,B),beforeB);
  } finally {await client.end();}
});
