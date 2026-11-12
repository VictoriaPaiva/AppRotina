// Explicit real Development smoke. Temporary account only; no Production or fixtures.
import {createClient} from '@supabase/supabase-js';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync,cpSync,readdirSync,symlinkSync,unlinkSync,rmSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const REF='zkaufspoigruofdillts';
assert(process.argv.includes('--development'),'Explicit --development required');
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(n=>/^\w+=/.test(n)).map(n=>{const i=n.indexOf('=');return[n.slice(0,i),n.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname,REF+'.supabase.co');
assert.equal(readFileSync('supabase/.temp/project-ref','utf8').trim(),REF);
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

const checked=async promise=>{const r=await promise;if(r.error)throw Error('Development operation rejected: '+(r.error.code??r.error.status??r.error.name));return r.data;};
async function cleanupOwner(id,mail){
 assert(/^[0-9a-f-]{36}$/.test(id));assert(/^rotina-checklist-smoke-[0-9a-f-]{36}@example[.]invalid$/.test(mail));
 const verified=await checked(admin.auth.admin.getUserById(id));assert.equal(verified.user.email,mail);
 const sqlFile='node_modules/.cache/development-checklist-cleanup.sql';
 writeFileSync(sqlFile,"begin;set constraints all deferred;"+['daily_plan_items','activity_subitems','goals','activities','areas'].map(t=>"delete from public."+t+" where user_id='"+id+"' and exists(select 1 from auth.users where id='"+id+"' and email='"+mail+"');").join('')+"commit;select true as smoke_cleanup;");
 await promisify(execFile)(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--file',sqlFile,'-o','json'],{windowsHide:true});
 await checked(admin.auth.admin.deleteUser(id));
}

const run=randomUUID(),email='rotina-checklist-smoke-'+run+'@example.invalid',password=randomBytes(32).toString('base64url');
const fixture=path.resolve('.development-checklist-smoke-app'),base='http://127.0.0.1:3196',port=3197;
let owner,next,browser,socket;const pending=new Map();let serial=0,nextLog='';const errors=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function send(method,params={}){const id=++serial;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},60000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error('Browser expression failed');return r.result.value;}
async function wait(expression){const end=Date.now()+90000;while(!await evaluate(expression)){if(Date.now()>end)throw Error('Browser condition timeout');await pause(200);}}
const hydrated=s=>`(()=>{const n=document.querySelector(${JSON.stringify(s)});return !!n&&Object.keys(n).some(k=>k.startsWith('__reactProps'));})()`;
async function input(selector,value){await wait(hydrated(selector));await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(120);}
async function select(field,value){await wait(hydrated('select[data-field="'+field+'"]'));await evaluate(`(()=>{const n=document.querySelector('select[data-field="${field}"]');n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(150);}
async function navigate(route){await send('Page.navigate',{url:base+route});}
async function reload(){const old=await evaluate('performance.timeOrigin');await send('Page.reload');await wait(`performance.timeOrigin!==${old}&&document.readyState==='complete'`);}
let report={project:'Rotina - Desenvolvimento',run,steps:[]};
try{
 const created=await checked(admin.auth.admin.createUser({email,password,email_confirm:true}));owner=created.user.id;console.log('Temporary Development identity created');
 await checked(client.auth.signInWithPassword({email,password}));console.log('Temporary owner Auth session verified');
 const area=randomUUID();await checked(client.from('areas').insert({id:area,user_id:owner,name:'Smoke checklist '+run,sort_position:0}));
 mkdirSync(fixture,{recursive:true});for(const dir of ['app','components','lib','types','public','hooks'])if(existsSync(dir))cpSync(dir,path.join(fixture,dir),{recursive:true});
 for(const name of readdirSync('.'))if(/^(package\.json|tsconfig\.json|next-env\.d\.ts|proxy\.ts|next\.config\..+|postcss\.config\..+|tailwind\.config\..+)$/.test(name))cpSync(name,path.join(fixture,name));
 symlinkSync(path.resolve('node_modules'),path.join(fixture,'node_modules'),'junction');
 next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev',fixture,'--hostname','127.0.0.1','--port','3196'],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:env.NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,NEXT_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});next.stdout.on('data',n=>nextLog+=n);next.stderr.on('data',n=>nextLog+=n);
 const end=Date.now()+90000;while(!nextLog.includes('Ready in')){assert(next.exitCode===null&&Date.now()<end,'Next startup');await pause(200);}
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--disable-background-networking','--remote-debugging-port='+port,'--user-data-dir='+path.resolve('node_modules/.cache/development-checklist-browser-'+run),'about:blank'],{windowsHide:true,stdio:'ignore'});
 let tabs;while(!tabs){try{tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();}catch{await pause(200);}}
 socket=new WebSocket(tabs.find(n=>n.type==='page').webSocketDebuggerUrl);await once(socket,'open');socket.addEventListener('message',event=>{const p=JSON.parse(event.data);if(p.id){const w=pending.get(p.id);if(w){pending.delete(p.id);if(p.error)w.reject(Error('CDP rejected'));else w.resolve(p.result);}}else if(p.method==='Runtime.exceptionThrown')errors.push(p.params.exceptionDetails.text);});
 await send('Page.enable');await send('Runtime.enable');
 await navigate('/auth/login');await input('#email',email);await input('#password',password);await evaluate(`document.querySelector('form').requestSubmit()`);await wait(`location.pathname==='/hoje'||location.pathname==='/'`);
 console.log('Real Development: browser login with isolated temporary account passed');
 const name='Smoke three checks '+run;
 await navigate('/banco-mestre/nova');await input('input[data-field=name]',name);await select('areaId',area);await select('type','checklistGoal');await select('trackingMode','checklist');
 for(const label of ['Item A','Item B','Item C']){await input('input[aria-label="Novo item da checklist"]',label);await evaluate(`Array.from(document.querySelectorAll('button')).find(n=>n.textContent.trim()==='Adicionar item').click()`);await wait(`document.querySelector('input[aria-label="Novo item da checklist"]').value===''`);}
 await evaluate(`document.querySelector('form').requestSubmit()`);await wait(`location.pathname.startsWith('/banco-mestre/')&&location.pathname!=='/banco-mestre/nova'`);const id=await evaluate(`location.pathname.split('/').at(-1)`);
 const definition=await checked(client.from('activities').select('id,goal_tracking_mode,checklist_items').eq('id',id).single());assert.equal(definition.goal_tracking_mode,'checklist');assert.deepEqual(definition.checklist_items.map(n=>n.label),['Item A','Item B','Item C']);
 await navigate('/banco-mestre/'+id+'/editar');await wait(hydrated('input[aria-label="Texto do item 3"]'));assert.equal(await evaluate(`document.querySelector('input[aria-label="Texto do item 3"]').value`),'Item C');
 report.steps.push('real UI create/save/reopen: 3 checklist_items');console.log('Real Development: three items persisted and reopened');
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
 async function plan(day){await navigate('/planejamento?date='+day);await wait(hydrated('#plan-activity'));await evaluate(`(()=>{const n=document.querySelector('#plan-activity');n.value=${JSON.stringify(id)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(200);await evaluate(`document.querySelector('#plan-activity').closest('form').requestSubmit()`);await wait(`document.body.textContent.includes('0 de 3')`);}
 await plan(date);let row=await checked(client.from('daily_plan_items').select('*').eq('activity_id',id).eq('planned_date',date).single());assert.equal(row.goal_tracking_mode_snapshot,'checklist');assert.equal(row.checklist_snapshot.length,3);assert.deepEqual(row.checklist_snapshot.map(({id,label})=>({id,label})),definition.checklist_items);
 await navigate('/hoje');await wait(hydrated('input[type=checkbox]'));assert.equal(await evaluate(`document.querySelectorAll('input[type=checkbox]').length`),3);
 await wait(`!document.querySelector('input[type=checkbox]').disabled`);await evaluate(`document.querySelector('input[type=checkbox]').click()`);await wait(`document.body.textContent.includes('1 de 3')`);await reload();await wait(`document.body.textContent.includes('1 de 3')`);
 row=await checked(client.from('daily_plan_items').select('*').eq('id',row.id).single());assert.equal(row.checklist_snapshot.filter(n=>n.completedAt).length,1);
 report.steps.push('real plan -> snapshot exactly 3 -> Hoje 3 checks -> 1/3 + refresh');
 const nextDate=new Date(date+'T12:00:00Z');nextDate.setUTCDate(nextDate.getUTCDate()+1);await plan(nextDate.toISOString().slice(0,10));const other=await checked(client.from('daily_plan_items').select('*').eq('activity_id',id).eq('planned_date',nextDate.toISOString().slice(0,10)).single());assert(other.checklist_snapshot.every(n=>n.completedAt===null));
 await navigate('/banco-mestre/'+id+'/editar');await input('input[aria-label="Texto do item 1"]','Definition changed later');await evaluate(`document.querySelector('form').requestSubmit()`);await wait(`location.pathname===${JSON.stringify('/banco-mestre/'+id)}`);
 const frozen=await checked(client.from('daily_plan_items').select('*').eq('id',row.id).single());assert.deepEqual(frozen,row);report.steps.push('independent date and historical snapshot unchanged after master edit');assert.deepEqual(errors,[]);
 report.status='passed';console.log('Real Development: snapshot, Hoje, refresh, dates and history passed');
}catch(error){report.error=error.message;console.error('Smoke stage failed:',error.message);throw error;}finally{
 if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close')}catch{}socket.close();}if(browser&&browser.exitCode===null)browser.kill('SIGTERM');
 if(owner){await cleanupOwner(owner,email);report.cleanup='temporary owner and owned smoke records removed';console.log('Real Development: only temporary smoke account/data removed');}
 if(next){if(process.platform==='win32'){try{await promisify(execFile)('taskkill',['/pid',String(next.pid),'/T','/F'],{windowsHide:true});}catch{}}else next.kill('SIGTERM');await pause(1500);}
 if(existsSync(fixture)){assert.equal(fixture,path.join(process.cwd(),'.development-checklist-smoke-app'));if(existsSync(path.join(fixture,'node_modules')))unlinkSync(path.join(fixture,'node_modules'));try{rmSync(fixture,{recursive:true,force:true,maxRetries:20,retryDelay:300});}catch{report.fixtureCleanup='requires local directory cleanup';}}
 mkdirSync('node_modules/.cache',{recursive:true});writeFileSync('node_modules/.cache/development-checklist-smoke-result.json',JSON.stringify(report,null,2));
}
