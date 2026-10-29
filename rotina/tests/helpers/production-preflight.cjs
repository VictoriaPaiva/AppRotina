/* eslint-disable @typescript-eslint/no-require-imports -- Local release checks; no deploy, cookies or real account operations. */
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{randomBytes}=require('node:crypto');
const app=path.resolve(__dirname,'../..');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(directory,e.name)):[path.join(directory,e.name)]);}
async function main(){
  // A fresh fake admin marker proves it is not in browser assets. Never print it.
  // Actual local env files and the Development CLI link remain unchanged.
  const canary='sb_secret_'+randomBytes(32).toString('hex');
  const env={...process.env,NODE_ENV:'production',SUPABASE_SECRET_KEY:canary,DEV_DATA_CLEANUP_ENABLED:'true',DEV_DATA_CLEANUP_ALLOW_EXECUTE:'true'};
  const build=process.platform==='win32'
    ? spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm.cmd run build'],{cwd:app,env,windowsHide:true,stdio:'inherit'})
    : spawn('npm',['run','build'],{cwd:app,env,stdio:'inherit'});
  const exit=await new Promise((resolve,reject)=>{build.on('error',reject);build.on('exit',resolve);});
  assert.equal(exit,0,'npm run build failed');
  let browserAssets=0;
  for(const file of files(path.join(app,'.next/static'))){
    if(!/\.(?:js|json|html|map)$/.test(file))continue;
    browserAssets++;const value=fs.readFileSync(file,'utf8');
    assert(!value.includes(canary),'Administrative canary leaked to browser assets');
    assert(!value.includes('process.env.SUPABASE_SECRET_KEY')&&!value.includes('process.env.SUPABASE_SERVICE_ROLE_KEY'),'Administrative env access in browser assets');
    assert(!/sb_secret_[A-Za-z0-9_-]{20,}/.test(value),'Secret-like key in browser assets');
    for(const token of value.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]){
      try {assert.notEqual(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).role,'service_role','Administrative JWT in browser assets');}
      catch(error){if(error instanceof assert.AssertionError)throw error;}
    }
  }
  const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const origin='http://127.0.0.1:'+port;
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:app,env,windowsHide:true,stdio:'ignore'});
  const checks=[];
  async function check(route,status,options={}){
    const response=await fetch(origin+route,{redirect:'manual',signal:AbortSignal.timeout(20000),...options});
    assert.equal(response.status,status,route);
    if(status===307)assert.equal(new URL(response.headers.get('location'),origin).pathname,'/auth/login');
    checks.push({route,status});return response;
  }
  try {
    let ready=false;
    for(let i=0;i<80;i++){try{await fetch(origin+'/auth/login',{signal:AbortSignal.timeout(1500)});ready=true;break;}catch{await pause(250);}}
    assert(ready,'Production server did not start');
    await check('/auth/login',200);
    for(const route of ['/hoje','/planejamento','/calendario','/projetos','/banco-mestre','/ideias','/financas','/conta'])await check(route,307);
    await check('/dev/limpar-dados',404);
    for(const route of ['/api/dev/clear-data','/api/dev/data-smoke','/api/dev/rls-smoke'])await check(route,404,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'preview'})});
    for(const route of ['/api/dev/data-smoke','/api/dev/rls-smoke'])await check(route,404);
    const deletion={method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({confirmation:'EXCLUIR MINHA CONTA'})};
    await check('/api/account/delete',401,deletion); // No cookie/JWT; cannot reach admin deletion.
    await check('/api/account/delete',403,{...deletion,headers:{...deletion.headers,Origin:'https://different-origin.invalid'}});
    const report={build:true,browserAssets,administrativeCanaryLeaked:false,protectedRoutesRedirectToLogin:true,devToolsDeniedEvenWithFlagsTrue:true,noAuthenticatedCalls:true,noRealSecretUsed:true,checks};
    const reportPath=path.join(app,'node_modules/.cache/deploy');fs.mkdirSync(reportPath,{recursive:true});fs.writeFileSync(path.join(reportPath,'production-preflight.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  } finally {
    server.kill();
    await Promise.race([new Promise(resolve=>server.once('exit',resolve)),pause(3000)]);
  }
}
main().catch(error=>{console.error('Production preflight failed:',error.message);process.exitCode=1;});
