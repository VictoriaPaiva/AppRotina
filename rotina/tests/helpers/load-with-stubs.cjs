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
    if(name==='react'||name==='react/jsx-runtime')return require(name);
    assert(false,'Missing stub: '+name);
  },mod);
  return mod.exports;
}
module.exports={withStubs};
