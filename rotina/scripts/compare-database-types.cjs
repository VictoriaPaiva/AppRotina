/* eslint-disable @typescript-eslint/no-require-imports -- Read-only comparison of TypeScript contracts. */
const ts=require('typescript');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
if(!process.argv[2]) {console.error('Usage: node scripts/compare-database-types.cjs <candidate.ts>');process.exit(1);}
const files=[path.join(root,'lib/banco-mestre/data/database.types.ts'),path.resolve(process.argv[2])];
const program=ts.createProgram(files,{strict:true,noEmit:true,skipLibCheck:true,target:ts.ScriptTarget.ES2020});
const checker=program.getTypeChecker();
const sources=files.map(f=>program.getSourceFile(f));
const diagnostics=[...program.getSyntacticDiagnostics(),...program.getSemanticDiagnostics()];
if(diagnostics.length) throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
function alias(source,name) {
  const node=source.statements.find(n=>ts.isTypeAliasDeclaration(n)&&n.name.text===name);
  if(!node) throw Error('Missing alias: '+name);
  return checker.getTypeAtLocation(node);
}
function property(type,name) {
  const symbol=checker.getPropertyOfType(type,name);
  if(!symbol) throw Error('Missing property: '+name);
  return checker.getTypeOfSymbolAtLocation(symbol,symbol.valueDeclaration??symbol.declarations[0]);
}
const names=type=>checker.getPropertiesOfType(type).map(s=>s.name).sort();
function fields(type) {
  return Object.fromEntries(checker.getPropertiesOfType(type).sort((a,b)=>a.name.localeCompare(b.name)).map(s=>{
    const t=checker.getTypeOfSymbolAtLocation(s,s.valueDeclaration??s.declarations[0]);
    return [s.name,{optional:!!(s.flags&ts.SymbolFlags.Optional),type:checker.typeToString(t,undefined,ts.TypeFormatFlags.NoTruncation).split(' | ').sort().join(' | ')}];
  }));
}
function literal(type) {
  if(type.isStringLiteral()) return type.value;
  if(checker.isTupleType(type)) return checker.getTypeArguments(type).map(literal);
  const value=checker.typeToString(type);
  return value==='true'?true:value==='false'?false:value;
}
function relations(type) {
  return checker.getTypeArguments(type).map(t=>Object.fromEntries(names(t).map(k=>[k,literal(property(t,k))]))).sort((a,b)=>a.foreignKeyName.localeCompare(b.foreignKeyName));
}
const databases=sources.map(s=>alias(s,'Database'));
const schemas=databases.map(d=>property(d,'public'));
const tables=schemas.map(s=>property(s,'Tables'));
const differences=[];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function compareFields(label,a,b) {
  const left=fields(a),right=fields(b);
  for(const key of new Set([...Object.keys(left),...Object.keys(right)])) {
    if(!same(left[key],right[key])) differences.push({path:label+'.'+key,current:left[key]??null,official:right[key]??null});
  }
}
const tableNames=tables.map(names);
if(!same(...tableNames)) differences.push({path:'public.Tables',current:tableNames[0],official:tableNames[1]});
for(const table of tableNames[0].filter(n=>tableNames[1].includes(n))) {
  const pair=tables.map(t=>property(t,table));
  for(const shape of ['Row','Insert','Update']) compareFields(table+'.'+shape,...pair.map(t=>property(t,shape)));
  const pairRelations=pair.map(t=>relations(property(t,'Relationships')));
  for(const name of new Set(pairRelations.flat().map(r=>r.foreignKeyName))) {
    const [current,official]=pairRelations.map(list=>list.find(r=>r.foreignKeyName===name)??null);
    if(!same(current,official)) differences.push({path:table+'.Relationships.'+name,current,official});
  }
}
const functions=schemas.map(s=>property(s,'Functions'));
const functionNames=functions.map(names);
if(!same(...functionNames)) differences.push({path:'public.Functions',current:functionNames[0],official:functionNames[1]});
for(const name of functionNames[0].filter(n=>functionNames[1].includes(n))) {
  const pair=functions.map(t=>property(t,name));
  compareFields('Functions.'+name+'.Args',...pair.map(t=>property(t,'Args')));
  const returns=pair.map(t=>checker.typeToString(property(t,'Returns')));
  if(!same(...returns)) differences.push({path:'Functions.'+name+'.Returns',current:returns[0],official:returns[1]});
}
for(const section of ['Views','Enums','CompositeTypes']) {
  const pair=schemas.map(s=>names(property(s,section)));
  if(!same(...pair)) differences.push({path:'public.'+section,current:pair[0],official:pair[1]});
}
const json=sources.map(s=>alias(s,'Json'));
console.log(JSON.stringify({
  tables:tableNames,functions:functionNames,
  jsonMutuallyAssignable:checker.isTypeAssignableTo(json[0],json[1])&&checker.isTypeAssignableTo(json[1],json[0]),
  databaseKeys:databases.map(names),
  exports:sources.map(s=>checker.getExportsOfModule(checker.getSymbolAtLocation(s)).map(x=>x.name).sort()),
  differences,
},null,2));
