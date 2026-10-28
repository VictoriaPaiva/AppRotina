// Dedicated, disposable localhost cluster. Never reads a DB URL or project credentials.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';

const exec=promisify(execFile);
const windows=process.platform==='win32';
const testFile=process.argv[2]==='--account-deletion'?'tests/postgres/account-deletion.test.mjs':'tests/postgres/progress-concurrency.test.mjs';
if(process.argv[2] && process.argv[2]!=='--account-deletion')throw Error('Unknown local suite.');
const bin=resolve(process.env.ROTINA_PG_BIN ?? 'node_modules/.cache/rotina-pg17/pgsql/bin');
const exe=name=>join(bin,name+(windows?'.exe':''));
for(const name of ['postgres','pg_ctl','initdb']){
 if(!existsSync(exe(name)))throw new Error(`Missing ${name}: configure ROTINA_PG_BIN with PostgreSQL 17 binaries.`);
}
const root=resolve('node_modules/.cache/rotina-pg-concurrency');
const data=join(root,randomUUID());
await mkdir(data,{recursive:true});
const net=createServer();await new Promise((done,fail)=>{net.once('error',fail);net.listen(0,'127.0.0.1',done);});
const port=net.address().port;await new Promise(done=>net.close(done));
const options={windowsHide:true,maxBuffer:1024*1024};
// On Windows a postmaster can inherit pg_ctl's pipe handles. Wait for pg_ctl's
// exit, not for inherited stdout/stderr handles to close with the server.
const control=args=>new Promise((done,fail)=>{
 const p=spawn(exe('pg_ctl'),args,{windowsHide:true,stdio:'ignore'});
 p.once('error',fail);p.once('exit',code=>code===0?done():fail(new Error(`pg_ctl exited ${code}; inspect the disposable server.log.`)));
});
const version=(await exec(exe('postgres'),['--version'],options)).stdout.trim();
if(!/\b17\./.test(version))throw new Error('This suite requires PostgreSQL major 17.');
console.log(`${version}; disposable loopback cluster; no remote connections.`);
await exec(exe('initdb'),['-D',data,'-U','postgres','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--locale=C'],options);
let started=false;
try {
 await control(['-D',data,'-l',join(data,'server.log'),'-w','-t','30','-o',
  `-h 127.0.0.1 -p ${port} -c deadlock_timeout=100ms -c max_connections=20`,'start']);
 started=true;
 console.log('Local server ready; starting independent-session tests.');
 const status=await new Promise((done,fail)=>{
  const child=spawn(process.execPath,['--test','--test-concurrency=1','--test-timeout=30000',testFile],{
   stdio:'inherit',windowsHide:true,
   env:{...process.env,ROTINA_PG_PORT:String(port),ROTINA_PG_DATA:data},
  });
  child.once('error',fail);child.once('exit',code=>done(code??1));
 });
 process.exitCode=status;
} finally {
 if(started){
  console.log('Stopping disposable PostgreSQL; waiting for its durable shutdown checkpoint.');
  // Windows filesystem/antivirus flushes can exceed pg_ctl's short default.
  // Keep normal fsync/synchronous_commit; allow the real checkpoint to finish.
  await control(['-D',data,'-w','-t','1200','-m','fast','stop']);
  console.log('Disposable PostgreSQL stopped.');
 }
 console.log('Cluster/log retained only in ignored node_modules/.cache.');
}
