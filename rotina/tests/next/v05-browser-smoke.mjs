// Chrome uses a disposable profile and synthetic local data; no user session.
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function writeV05Fixture(fixture){
  const stamp='2026-11-01T12:00:00Z',uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const base=(n,name,time)=>({id:uuid(n),activityId:uuid(100+n),name,plannedDate:'2026-11-01',completedAt:null,createdAt:stamp,updatedAt:stamp,active:true,plannedTime:time,sortOrder:n,manualOrder:true});
  const items=[{...base(1,'Rotina noturna com checklist','20:30'),activityTypeSnapshot:'checklistGoal',checklist:Array.from({length:4},(_,i)=>({id:uuid(200+i),label:['Escovar dentes','Skincare','Separar roupa','Preparar mochila'][i],completedAt:i<2?stamp:null}))},base(2,'Comprar shampoo e organizar os materiais da semana',null),
    {...base(3,'Faxina com subitens','10:30'),plannedDurationMinutes:45,subitems:[{id:uuid(300),parentId:null,name:'Sala',durationMinutes:15,sortOrder:0,active:true,defaultSelected:true,selected:true,overrideMinutes:null,completedAt:null,plannedMinutes:45},...Array.from({length:3},(_,i)=>({id:uuid(301+i),parentId:uuid(300),name:['Passar pano','Limpar sofá','Arrumar armário'][i],durationMinutes:15,sortOrder:i,active:true,defaultSelected:true,selected:true,overrideMinutes:null,completedAt:null,plannedMinutes:15}))]},base(4,'Lavar cabelo',null),base(5,'Separar roupas',null)];
  const data={status:'ready',today:'2026-11-01',date:'2026-11-01',tomorrow:'2026-11-02',items,pending:[],activities:items.map(n=>({id:n.activityId,name:n.name,active:true}))};
  const directory=path.join(fixture,'app/v05-smoke');mkdirSync(directory,{recursive:true});
  writeFileSync(path.join(directory,'page.tsx'),`import {Suspense} from 'react';import {PlanningBoard} from '@/components/planning/PlanningBoard';import type {PlanReadResult} from '@/lib/planning/contracts';export default function Page(){return <Suspense fallback={<p>Carregando</p>}><PlanningBoard todayMode data={${JSON.stringify(data)} as PlanReadResult}/></Suspense>;}`);
}

export async function runV05BrowserSmoke(baseUrl,{live,cookie}={}){
  const initialPath=live?'/hoje':'/v05-smoke';
  const warmup=await fetch(baseUrl+initialPath,{headers:cookie?{cookie}:{},signal:AbortSignal.timeout(60000)});assert.equal(warmup.status,200);await warmup.text();
  const executable=process.env.ROTINA_CHROME_BIN??['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  assert(executable,'Set ROTINA_CHROME_BIN for the optional viewport smoke');
  const port=3195,profile=path.resolve('node_modules/.cache/v05-browser-profile-'+process.pid);
  const browser=spawn(executable,['--headless=new','--no-sandbox','--disable-gpu','--disable-extensions','--no-first-run','--no-default-browser-check','--disable-background-networking',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let socket;const pending=new Map();let serial=0;const errors=[],posts=[];
  function send(method,params={}){const id=++serial;return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},method==='Page.navigate'||method==='Network.setCookie'?60000:15000);pending.set(id,{resolve:v=>{clearTimeout(timeout);resolve(v);},reject:e=>{clearTimeout(timeout);reject(e);}});socket.send(JSON.stringify({id,method,params}));});}
  try{
    const deadline=Date.now()+30000;let pages;
    while(!pages){try{pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();}catch{assert(Date.now()<deadline,'Chrome startup timeout');await pause(200);}}
    socket=new WebSocket(pages.find(n=>n.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    socket.addEventListener('message',event=>{const packet=JSON.parse(event.data);if(packet.id){const waiter=pending.get(packet.id);if(waiter){pending.delete(packet.id);if(packet.error)waiter.reject(Error(packet.error.message));else waiter.resolve(packet.result);}}
      else if(packet.method==='Runtime.exceptionThrown')errors.push(packet.params.exceptionDetails.text);
      else if(packet.method==='Network.requestWillBeSent'&&packet.params.request.method==='POST')posts.push(new URL(packet.params.request.url).pathname);
    });
    await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
    if(cookie){const split=cookie.indexOf('=');await send('Network.setCookie',{name:cookie.slice(0,split),value:cookie.slice(split+1),url:baseUrl+'/',httpOnly:true,sameSite:'Lax'});}
    const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
    async function waitFor(expression){const until=Date.now()+60000;while(!await evaluate(expression)){
      if(Date.now()>=until){const page=await evaluate(`({url:location.href,text:document.body?.innerText,alerts:[...document.querySelectorAll('[role=alert]')].map(n=>n.textContent)})`);writeFileSync('node_modules/.cache/v05-browser-failure.json',JSON.stringify({page,errors,posts,state:live?await live.inspect():null},null,2));throw Error('Browser condition timed out: '+expression);}await pause(200);}}
    const hydrated=selector=>`(()=>{const n=document.querySelector(${JSON.stringify(selector)});return !!n&&Object.keys(n).some(k=>k.startsWith('__reactProps'));})()`;
    async function navigate(route){await send('Page.navigate',{url:baseUrl+route});}
    async function input(selector,value){await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw Error('Missing input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(100);}
    if(live){
      const labels=live.definition.map(n=>n.label);
      await navigate('/banco-mestre/nova');await waitFor(hydrated('input[data-field="name"]'));
      await input('input[data-field="name"]','Meta quantitativa local');
      await evaluate(`(()=>{for(const [field,value] of [['areaId',${JSON.stringify(live.areaId)}],['type','checklistGoal']]){const n=document.querySelector('select[data-field='+field+']');n.value=value;n.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
      await waitFor(hydrated('select[data-field="trackingMode"]'));
      await evaluate(`(()=>{const n=document.querySelector('select[data-field=trackingMode]');n.value='quantity';n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await waitFor(`Array.from(document.querySelectorAll('button')).some(n=>n.textContent.trim()==='Adicionar meta')`);
      await evaluate(`Array.from(document.querySelectorAll('button')).find(n=>n.textContent.trim()==='Adicionar meta').click()`);
      await waitFor(hydrated('input[data-field="goals.0.minimum"]'));
      await evaluate(`(()=>{const n=document.querySelector('select[data-field="goals.0.metric"]');n.value='quantity';n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await input('input[data-field="goals.0.unit"]','garrafas');
      await evaluate(`(()=>{const n=document.querySelector('select[data-field="goals.0.period"]');n.value='day';n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await input('input[data-field="goals.0.minimum"]','2');
      await evaluate(`document.querySelector('form').requestSubmit()`);await waitFor(`location.pathname.startsWith('/banco-mestre/') && location.pathname !== '/banco-mestre/nova'`);
      await live.trackActivity(await evaluate(`location.pathname.split('/').at(-1)`));
      assert.equal((await live.inspect()).numericGoals,1);assert.equal((await live.inspect()).template.length,0);
      await navigate('/banco-mestre/'+live.activityId+'/editar');await waitFor(hydrated('input[data-field="goals.0.minimum"]'));
      assert.equal(await evaluate(`document.querySelector('input[data-field="goals.0.minimum"]').value`),'2');
      assert.equal(await evaluate(`document.querySelector('select[data-field="trackingMode"]').value`),'quantity');
      await navigate('/planejamento?date='+live.date);await waitFor(hydrated('#plan-activity'));
      await evaluate(`(()=>{const n=document.querySelector('#plan-activity');n.value=${JSON.stringify(live.activityId)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(150);
      await evaluate(`document.querySelector('#plan-activity').closest('form').requestSubmit()`);await waitFor(`document.body.textContent.includes('0 de 2')`);
      await navigate('/hoje');await waitFor(hydrated('input[type=checkbox]'));
      assert.equal(await evaluate(`document.querySelectorAll('input[type=checkbox]').length`),2);
      let quantityTarget=2;
      async function quantityClick(index,total){await waitFor(`!document.querySelectorAll('input[type=checkbox]')[${index}].disabled`);await evaluate(`document.querySelectorAll('input[type=checkbox]')[${index}].click()`);await waitFor(`document.body.textContent.includes('${total} de ${quantityTarget}')`);}
      await quantityClick(0,1);const quantityOrigin=await evaluate('performance.timeOrigin');await send('Page.reload');await waitFor(`performance.timeOrigin!==${quantityOrigin}&&document.readyState==='complete'`);await waitFor(hydrated('input[type=checkbox]'));await waitFor(`document.body.textContent.includes('1 de 2')`);
      await navigate('/banco-mestre/'+live.activityId+'/editar');await waitFor(hydrated('input[data-field="goals.0.minimum"]'));await input('input[data-field="goals.0.minimum"]','3');await waitFor(`document.body.textContent.includes('Alterações não salvas.')`);await evaluate(`document.querySelector('form').requestSubmit()`);await waitFor(`location.pathname===${JSON.stringify('/banco-mestre/'+live.activityId)}`);
      quantityTarget=3;await navigate('/hoje');await waitFor(hydrated('input[type=checkbox]'));await waitFor(`document.body.textContent.includes('1 de 3')`);assert.equal(await evaluate(`document.querySelectorAll('input[type=checkbox]').length`),3);assert.equal((await live.inspect()).plans[0].quantity_snapshot[0].checked[0],0);
      await quantityClick(1,2);await quantityClick(2,3);assert((await live.inspect()).plans[0].completed_at);
      assert.equal(await evaluate(`document.querySelector('a[href="/banco-mestre/${live.activityId}"]').closest('section').querySelector('h2').textContent`),'Concluídas');
      await quantityClick(0,2);assert.equal((await live.inspect()).plans[0].completed_at,null);
      assert.equal(await evaluate(`document.querySelector('a[href="/banco-mestre/${live.activityId}"]').closest('section').querySelector('h2').textContent`),'Para hoje');
      await evaluate(`Array.from(document.querySelector('a[href="/banco-mestre/${live.activityId}"]').closest('li').querySelectorAll('button')).find(n=>n.textContent.trim()==='Concluir').click()`);await waitFor(`document.body.textContent.includes('3 de 3')`);
      assert.equal((await live.inspect()).plans[0].quantity_snapshot[0].checked.length,3);
      await evaluate(`Array.from(Array.from(document.querySelectorAll('a')).find(n=>n.textContent==='Normal local 0').closest('li').querySelectorAll('button')).find(n=>n.textContent.trim()==='Concluir').click()`);
      await waitFor(`Array.from(document.querySelectorAll('a')).find(n=>n.textContent==='Normal local 0').closest('section').querySelector('h2').textContent==='Concluídas'`);
      await evaluate(`Array.from(Array.from(document.querySelectorAll('a')).find(n=>n.textContent==='Normal local 0').closest('li').querySelectorAll('button')).find(n=>n.textContent.includes('Desfazer')).click()`);
      await waitFor(`Array.from(document.querySelectorAll('a')).find(n=>n.textContent==='Normal local 0').closest('section').querySelector('h2').textContent==='Para hoje'`);
      await live.removeTrackedPlans();
      console.log('Authenticated local UI: quantity master 2->3 sync preserves unit 1; normal/quantity complete and reopen move Today sections automatically');
      await navigate('/banco-mestre/nova');await waitFor(hydrated('input[data-field="name"]'));
      await input('input[data-field="name"]','Meta Checklist única');
      await evaluate(`(()=>{for(const [field,value] of [['areaId',${JSON.stringify(live.areaId)}],['type','checklistGoal']]){const n=document.querySelector('select[data-field='+field+']');n.value=value;n.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
      await waitFor(`!!document.querySelector('[data-field=checklistItems]')`);
      assert(await evaluate(`!document.body.textContent.includes('Itens de execução')&&!Array.from(document.querySelectorAll('button')).some(n=>n.textContent.trim()==='Adicionar meta')`));
      for(let i=0;i<4;i++){
        await input('input[aria-label="Novo item da checklist"]',labels[i]);
        if(i===1){await evaluate(`document.querySelector('input[aria-label="Novo item da checklist"]').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});}
        else await evaluate(`Array.from(document.querySelectorAll('button')).find(n=>n.textContent.trim()==='Adicionar item').click()`);
        await waitFor(hydrated('input[aria-label="Texto do item '+(i+1)+'"]'));
        assert.equal(await evaluate(`document.querySelector('input[aria-label="Texto do item ${i+1}"]').value`),labels[i]);
      }
      await evaluate(`document.querySelector('form').requestSubmit()`);await waitFor(`location.pathname.startsWith('/banco-mestre/') && location.pathname !== '/banco-mestre/nova'`);
      await live.trackActivity(await evaluate(`location.pathname.split('/').at(-1)`));
      const created=await live.inspect();assert.equal(created.template.length,4);assert.equal(created.numericGoals,0);
      console.log('Authenticated local UI: created checklist through Meta / Checklist only, four items, zero numeric goals, no second form');
      const edit='/banco-mestre/'+live.activityId+'/editar';
      await navigate(edit);await waitFor(hydrated('input[aria-label="Texto do item 4"]'));
      await input('input[aria-label="Texto do item 4"]','Preparar mochila (editada)');
      await waitFor(`document.body.textContent.includes('Alterações não salvas.')`);
      await evaluate(`document.querySelector('form').requestSubmit()`);await waitFor(`location.pathname===${JSON.stringify('/banco-mestre/'+live.activityId)}`);
      let state=await live.inspect();assert.equal(state.template.length,4);assert.equal(state.template[3].label,'Preparar mochila (editada)');assert.deepEqual(state.template.map(n=>n.id),live.definition.map(n=>n.id));
      async function plan(date){
        await navigate('/planejamento?date='+date);await waitFor(hydrated('#plan-activity'));
        await evaluate(`(()=>{const n=document.querySelector('#plan-activity');n.value=${JSON.stringify(live.activityId)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(150);
        if(date===live.date)await input('#plan-time','20:30');
        await evaluate(`document.querySelector('#plan-activity').closest('form').requestSubmit()`);
        await waitFor(`document.body.textContent.includes('0 de 4 concluídos')`);
      }
      await plan(live.date);state=await live.inspect();assert.equal(state.plans.length,1);assert.equal(state.plans[0].checklist_snapshot.length,4);
      await navigate('/hoje');await waitFor(`document.body.textContent.includes('0 de 4 concluídos')`);
      assert.equal(await evaluate(`document.querySelectorAll('input[type=checkbox]').length`),4);
      async function clickCheck(index,progress){await waitFor(hydrated('input[type=checkbox]'));await waitFor(`!!document.querySelectorAll('input[type=checkbox]')[${index}]&&!document.querySelectorAll('input[type=checkbox]')[${index}].disabled`);await evaluate(`document.querySelectorAll('input[type=checkbox]')[${index}].click()`);await waitFor(`document.body.textContent.includes(${JSON.stringify(progress+' de 4 concluídos')})`);}
      await clickCheck(0,1);const beforeReload=await evaluate('performance.timeOrigin');await send('Page.reload');await waitFor(`performance.timeOrigin!==${beforeReload}&&document.readyState==='complete'`);await waitFor(`document.body.textContent.includes('1 de 4 concluídos')`);
      for(let i=1;i<4;i++)await clickCheck(i,i+1);
      state=await live.inspect();assert(state.plans[0].completed_at);assert(state.plans[0].checklist_snapshot.every(n=>n.completedAt));
      await clickCheck(0,3);state=await live.inspect();assert.equal(state.plans[0].completed_at,null);
      await evaluate(`Array.from(document.querySelectorAll('button')).find(n=>n.textContent.trim()==='Concluir checklist').click()`);await waitFor(`document.body.textContent.includes('4 de 4 concluídos')`);
      await plan(live.nextDate);state=await live.inspect();assert.equal(state.plans.length,2);assert(state.plans.find(n=>n.planned_date===live.nextDate).checklist_snapshot.every(n=>n.completedAt===null));
      await navigate(edit);await waitFor(hydrated('input[aria-label="Texto do item 4"]'));await input('input[aria-label="Texto do item 4"]','Texto novo para próximos planos');
      await waitFor(`document.body.textContent.includes('Alterações não salvas.')`);
      await evaluate(`document.querySelector('form').requestSubmit()`);await waitFor(`location.pathname===${JSON.stringify('/banco-mestre/'+live.activityId)}`);
      await navigate('/hoje');await waitFor(`document.body.textContent.includes('4 de 4 concluídos')`);
      assert(await evaluate(`document.body.textContent.includes('Preparar mochila (editada)')&&!document.body.textContent.includes('Texto novo para próximos planos')`));
      state=await live.inspect();assert.equal(state.template[3].label,'Texto novo para próximos planos');assert.equal(state.plans.find(n=>n.planned_date===live.date).checklist_snapshot[3].label,'Preparar mochila (editada)');assert.equal(state.plans.find(n=>n.planned_date===live.nextDate).checklist_snapshot[3].label,'Texto novo para próximos planos');
      console.log('Authenticated local Next + PGlite: definition edit, snapshot 4 checks, 1/4 + reload, 4/4, reopen, bulk, independent dates and frozen history passed');
    }else await navigate(initialPath);
    const renderDeadline=Date.now()+60000;
    while(true){const result=await send('Runtime.evaluate',{expression:`document.body?.textContent.includes('de 4 concluídos')`,returnByValue:true});if(result.result.value)break;assert(Date.now()<renderDeadline,'V0.5 page render timeout');await pause(250);}
    const results=[];
    for(const [width,height] of [[360,800],[768,1024],[1440,900]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});await pause(300);
      const result=await send('Runtime.evaluate',{expression:`(()=>{const checks=[...document.querySelectorAll('input[type=checkbox]')].filter(n=>n.getClientRects().length);const first=checks[0];first?.focus();const focused=document.activeElement===first;const smallTargets=checks.filter(n=>(n.closest('label')??n).getBoundingClientRect().height<44).length;const details=document.querySelector('details');if(details){const open=details.open;details.open=!open;details.open=open;}return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,checks:checks.length,smallTargets,focused,times:[...document.querySelectorAll('time')].map(n=>n.textContent),moveButtons:[...document.querySelectorAll('button')].filter(n=>n.textContent.includes('Mover para')).length};})()`,returnByValue:true});
      const metrics=result.result.value;assert(metrics.scrollWidth<=width,JSON.stringify(metrics));assert.equal(metrics.smallTargets,0);assert(metrics.checks>=4&&metrics.focused&&metrics.moveButtons>=4);assert.deepEqual(metrics.times,['10:30','20:30']);
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      const keyboard=await send('Runtime.evaluate',{expression:`document.activeElement?.tagName`,returnByValue:true});assert.notEqual(keyboard.result.value,'BODY');
      const capture=await send('Page.captureScreenshot',{format:'png'});writeFileSync(`node_modules/.cache/v05-${width}.png`,Buffer.from(capture.data,'base64'));
      results.push(metrics);console.log(`V0.5 Chrome ${width}x${height}: no overflow, checkbox targets >=44px, keyboard focus${live?'':', zero writes'}`);
    }
    if(live){
      const mergeId=await live.seedOpenChecklist();
      await navigate('/banco-mestre/'+mergeId+'/editar');await waitFor(hydrated('input[aria-label="Novo item da checklist"]'));
      await input('input[aria-label="Novo item da checklist"]','Smoke C');
      await evaluate(`Array.from(document.querySelectorAll('button')).find(n=>n.textContent.trim()==='Adicionar item').click()`);
      await waitFor(hydrated('input[aria-label="Texto do item 3"]'));
      await evaluate(`document.querySelector('form').requestSubmit()`);await waitFor(`location.pathname===${JSON.stringify('/banco-mestre/'+mergeId)}`);
      await navigate('/hoje');
      const mergeRow=`Array.from(document.querySelectorAll('a')).find(n=>n.textContent==='Merge smoke')?.closest('li')`;
      await waitFor(`(()=>{const n=${mergeRow};return n?.textContent.includes('1 de 3')&&n.querySelectorAll('input[type=checkbox]').length===3;})()`);
      assert.deepEqual(await evaluate(`Array.from((${mergeRow}).querySelectorAll('input[type=checkbox]')).map(n=>n.checked)`),[true,false,false]);
      console.log('Checklist open A/B -> A/B/C: UI master save merges immediately, A checked, B/C pending');
      await live.seedVolume();await navigate('/hoje');
      const volumeRows=`Array.from(document.querySelectorAll('a')).filter(n=>n.textContent.startsWith('Volume smoke ')).map(n=>n.closest('li'))`;
      await waitFor(`(${volumeRows}).length===20`);
      for(let i=0;i<20;i++){
        const name='Volume smoke '+String(i).padStart(2,'0');
        const row=`Array.from(document.querySelectorAll('a')).find(n=>n.textContent===${JSON.stringify(name)})?.closest('li')`;
        await waitFor(`(()=>{const n=${row};return !!n&&[...n.querySelectorAll('button')].some(b=>/^Concluir/.test(b.textContent.trim())&&!b.disabled);})()`);
        await evaluate(`Array.from((${row}).querySelectorAll('button')).find(b=>/^Concluir/.test(b.textContent.trim())).click()`);
        await waitFor(`(${row})?.closest('section').querySelector('h2').textContent==='Concluídas'`);
      }
      const allDone=`(${volumeRows}).length===20&&(${volumeRows}).every(n=>n.closest('section').querySelector('h2').textContent==='Concluídas')`;
      await waitFor(allDone);const origin=await evaluate('performance.timeOrigin');await send('Page.reload');await waitFor(`performance.timeOrigin!==${origin}&&document.readyState==='complete'`);await waitFor(allDone);
      const row=`Array.from(document.querySelectorAll('a')).find(n=>n.textContent==='Volume smoke 13')?.closest('li')`;
      await waitFor(`Array.from((${row})?.querySelectorAll('button')??[]).some(b=>b.textContent.includes('Desfazer')&&!b.disabled)`);
      await evaluate(`Array.from((${row}).querySelectorAll('button')).find(b=>b.textContent.includes('Desfazer')).click()`);
      await waitFor(`(${row})?.closest('section').querySelector('h2').textContent==='Para hoje'`);
      await evaluate(`Array.from((${row}).querySelectorAll('button')).find(b=>/^Concluir/.test(b.textContent.trim())).click()`);await waitFor(allDone);
      console.log('20 mixed occurrences: complete, all visible including backlog, refresh, reopen and complete again passed');
      assert(posts.includes('/hoje')&&posts.includes('/planejamento'));
    }else assert.deepEqual(posts,[]);
    assert.deepEqual(errors,[]);writeFileSync('node_modules/.cache/v05-browser-results.json',JSON.stringify({results,errors,posts},null,2));
  }finally{
    if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close');}catch{ /* Chrome may close the socket before replying. */ }socket.close();}
    if(browser.exitCode===null&&browser.signalCode===null)browser.kill('SIGTERM');
    for(const waiter of pending.values())waiter.reject(Error('Chrome closed'));pending.clear();
    await pause(300);
  }
}
