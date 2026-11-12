// Real Next development rendering against an isolated, synthetic Supabase HTTP
// fixture. No Development/Production account or database is contacted.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdirSync,writeFileSync,cpSync,existsSync,symlinkSync,readdirSync,unlinkSync,rmSync,readFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {writeV05Fixture,runV05BrowserSmoke} from './v05-browser-smoke.mjs';

const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const live=process.argv.includes('--v05-authenticated')?await (await import('./v05-local-api.mjs')).createV05LocalApi():null;
const api=createServer(async(req,res)=>{
  if(live&&await live.handle(req,res))return;
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(req.url.startsWith('/auth/v1/user')?user:[]));
});
api.listen(0,'127.0.0.1');await once(api,'listening');
const apiUrl=`http://127.0.0.1:${api.address().port}`;
const port=3194;
const negativeControl=process.argv.includes('--without-request-boundary');
// Separate project/dist directory so an IDE's running next dev remains untouched.
const fixture=path.resolve('.render-time-smoke-app');
mkdirSync(fixture,{recursive:true});
for(const dir of ['app','components','lib','types','public','hooks']){
  if(existsSync(dir))cpSync(dir,path.join(fixture,dir),{recursive:true});
}
for(const entry of readdirSync('.')){
  if(/^(package\.json|tsconfig\.json|next-env\.d\.ts|proxy\.ts|next\.config\..+|postcss\.config\..+|tailwind\.config\..+)$/.test(entry))cpSync(entry,path.join(fixture,entry));
}
if(!existsSync(path.join(fixture,'node_modules')))symlinkSync(path.resolve('node_modules'),path.join(fixture,'node_modules'),'junction');
if(process.argv.includes('--v05'))writeV05Fixture(fixture);
// Optional negative control: change only the disposable copy, never app source.
if(negativeControl){
  const serverFile=path.join(fixture,'lib/supabase/server.ts');
  writeFileSync(serverFile,readFileSync(serverFile,'utf8').replace('  await connection();',''));
}
const segment=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=[segment({alg:'HS256',typ:'JWT'}),segment({sub:user.id,exp:4102444800,iat:1700000000,aud:'authenticated',role:'authenticated'}),'fixture'].join('.');
const session={access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:4102444800,user};
const cookie='sb-127-auth-token=base64-'+segment(session);
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev',fixture,'--hostname','127.0.0.1','--port',String(port)],{
  env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:apiUrl,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'},
  stdio:['ignore','pipe','pipe'],windowsHide:true,
});
let log='';child.stdout.on('data',v=>{log+=v;});child.stderr.on('data',v=>{log+=v;});
try {
  const deadline=Date.now()+60000;
  while(!log.includes('Ready in')){
    assert(child.exitCode===null,'Next exited before startup');
    assert(Date.now()<deadline,'Next startup timeout');
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  for(const route of ['/hoje','/banco-mestre','/planejamento','/calendario','/projetos','/ideias','/financas','/conta']){
    const response=await fetch(`http://127.0.0.1:${port}${route}`,{headers:{cookie},redirect:'manual',signal:AbortSignal.timeout(60000)});
    const html=await response.text();
    assert.equal(response.status,200,`${route}: HTTP ${response.status}`);
    assert(!/unstable value|next-prerender-current-time|Date\.now\(\).*prerender|Switched to client rendering/i.test(html),`${route}: rendering error in response`);
    console.log(`${route}: HTTP 200`);
  }
  for(const route of ['/hoje','/banco-mestre']){
    const response=await fetch(`http://127.0.0.1:${port}${route}`,{
      headers:{cookie,RSC:'1','Next-Router-Prefetch':'1'},redirect:'follow',signal:AbortSignal.timeout(60000),
    });
    const payload=await response.text();
    assert.equal(response.status,200,`${route} prefetch`);
    assert.equal(new URL(response.url).pathname,route,'prefetch must not fall back to login');
    assert(!/unstable value|next-prerender-current-time/i.test(payload),`${route}: prefetch clock error`);
    console.log(`${route}: RSC prefetch HTTP 200`);
  }
  if(process.argv.includes('--v05'))await runV05BrowserSmoke(`http://127.0.0.1:${port}`);
  if(live)await runV05BrowserSmoke(`http://127.0.0.1:${port}`,{live,cookie});
  await new Promise(resolve=>setTimeout(resolve,250));
  assert(!/unstable value|next-prerender-current-time/i.test(log),'clock error in Next log');
  console.log('Next log: no unstable clock errors');
} finally {
  mkdirSync('node_modules/.cache',{recursive:true});
  writeFileSync(`node_modules/.cache/render-time-smoke${negativeControl?'-baseline':''}.log`,log);
  child.kill('SIGTERM');
  if(child.exitCode===null&&child.signalCode===null)await once(child,'exit');
  await new Promise(resolve=>setTimeout(resolve,1500));
  api.closeAllConnections();api.close();
  if(live)await live.close();
  // Only remove our verified workspace-local fixture; unlink the dependency
  // junction first so recursive cleanup cannot touch the real node_modules.
  assert.equal(fixture,path.join(process.cwd(),'.render-time-smoke-app'));
  unlinkSync(path.join(fixture,'node_modules'));
  rmSync(fixture,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
