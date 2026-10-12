/* eslint-disable @typescript-eslint/no-require-imports -- Runner Node CommonJS sem dependência extra. */
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const cache=new Map();
function load(file) {
  const filename=path.resolve(root,file);
  if(cache.has(filename)) return cache.get(filename).exports;
  const mod={exports:{}}; cache.set(filename,mod);
  const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const localRequire=name=>{
    if(name.startsWith('@/') || name.startsWith('.')) {
      const resolved=name.startsWith('@/') ? path.resolve(root,name.slice(2)) : path.resolve(path.dirname(filename),name);
      return load(fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : resolved+'.ts');
    }
    return require(name);
  };
  new Function('exports','require','module',source)(mod.exports,localRequire,mod);
  return mod.exports;
}
module.exports={load};
