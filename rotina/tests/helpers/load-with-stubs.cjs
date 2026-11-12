/* eslint-disable @typescript-eslint/no-require-imports -- Shared Node-only TSX/action harness. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
function withStubs(file,stubs={}) {
  const filename=path.resolve(__dirname,'../..',file);
  const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod={exports:{}};
  new Function('exports','require','module',source)(mod.exports,name=>{
    if(Object.hasOwn(stubs,name))return stubs[name];
    if(name==='@/lib/activities/subitems')return require('./load-typescript.cjs').load('lib/activities/subitems.ts');
    if(name==='@/lib/activities/quantity')return require('./load-typescript.cjs').load('lib/activities/quantity.ts');
    if(name==='./PlanQuantity')return {PlanQuantity:()=>null};
    if(name==='./quantity-totals')return require('./load-typescript.cjs').load('lib/planning/quantity-totals.ts');
    if(name==='@/lib/activities/checklist')return require('./load-typescript.cjs').load('lib/activities/checklist.ts');
    if(name==='@/lib/planning/order')return require('./load-typescript.cjs').load('lib/planning/order.ts');
    if(name==='./ChecklistDefinitionEditor')return {ChecklistDefinitionEditor:()=>null};
    if(name==='./PlanChecklist'||name==='@/components/planning/PlanChecklist')return {PlanChecklist:()=>null};
    if(name==='./PlanTimeEditor')return {PlanTimeEditor:()=>null};
    if(name==='@/lib/banco-mestre/presentation')return require('./load-typescript.cjs').load('lib/banco-mestre/presentation.ts');
    if(name==='./SubitemDefinitionEditor')return {SubitemDefinitionEditor:()=>null};
    if(name==='./SubitemSelection')return {SubitemSelection:()=>null};
    if(name==='./PlanSubitems'||name==='@/components/planning/PlanSubitems')return {PlanSubitems:()=>null};
    // DOM navigation protection has its own event tests; component fixtures do not mount a browser.
    if(name==='@/lib/forms/draft-protection')return {useDraftProtection:()=>()=>{},confirmPageLeave:()=>true,allowPageLeave:()=>{}};
    if(name==='react'||name==='react/jsx-runtime')return require(name);
    assert(false,'Missing stub: '+name);
  },mod);
  return mod.exports;
}
module.exports={withStubs};
