/* eslint-disable @typescript-eslint/no-require-imports -- Offline navigation and source audit. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {withStubs}=require('./helpers/load-with-stubs.cjs');
const root=path.resolve(__dirname,'..');
test('module headers and logout remain accessible on creation/detail/edit routes without dead global controls',()=>{
  const titles={'hoje':'Hoje','planejamento':'Planejamento','calendario':'Calendário','banco-mestre':'Banco Mestre','ideias':'Ideias','projetos':'Projetos','financas':'Finanças'};
  for(const [route,title] of Object.entries(titles))for(const suffix of ['', '/nova', '/11111111-1111-4111-8111-111111111111', '/11111111-1111-4111-8111-111111111111/editar']) {
    const {TopBar}=withStubs('components/layout/TopBar.tsx',{'lucide-react':{UserRound:'svg'},'next/link':{default:'a'},'next/navigation':{usePathname:()=>'/'+route+suffix},'@/components/logout-button':{LogoutButton:()=>React.createElement('button',null,'Sair')}});
    const html=renderToStaticMarkup(React.createElement(TopBar));assert(html.includes(title));assert(html.includes('Sair'));assert(!/Buscar|Configurações|disabled/.test(html));
  }
  const {TopBar}=withStubs('components/layout/TopBar.tsx',{'lucide-react':{UserRound:'svg'},'next/link':{default:'a'},'next/navigation':{usePathname:()=>'/projetos-publico'},'@/components/logout-button':{LogoutButton:()=>null}});
  assert.equal(renderToStaticMarkup(React.createElement(TopBar)),'');
});
test('home opens the actual app; failed reads can reload the current URL without redirecting away from month/date',()=>{
  const {default:Home}=withStubs('app/page.tsx',{'next/navigation':{redirect:target=>{throw Object.assign(Error('redirect'),{target});}}});
  assert.throws(()=>Home(),error=>error.target==='/hoje');
  const original=global.window;let reloads=0;global.window={location:{reload(){reloads++;}}};
  try {const {ReloadPageButton}=withStubs('components/ui/ReloadPageButton.tsx',{'./button':{Button:'button'}});ReloadPageButton().props.onClick();assert.equal(reloads,1);}
  finally {global.window=original;}
  for(const [file,name] of [['ideas/IdeaReadError','IdeaReadError'],['projects/ProjectReadError','ProjectReadError'],['finance/FinanceReadError','FinanceReadError']]) {
    const ui=withStubs('components/'+file+'.tsx',{'next/link':{default:'a'},'@/components/ui/ReloadPageButton':{ReloadPageButton:()=>React.createElement('button',null,'Tentar novamente')}});
    const render=kind=>renderToStaticMarkup(React.createElement(ui[name],{data:{status:'error',kind,message:'Falha segura'}}));
    assert(render('Unknown').includes('Tentar novamente'));assert(!render('Unauthorized').includes('Tentar novamente'));assert(render('Unauthorized').includes('/auth/login'));
  }
});
test('literal internal UI links target existing routes; reachable app imports do not load mocks or starter cards',()=>{
  const files=[];
  function collect(directory) {for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    const full=path.join(directory,entry.name);if(entry.isDirectory())collect(full);else if(/\.tsx?$/.test(entry.name))files.push(full);
  }}
  collect(path.join(root,'app'));collect(path.join(root,'components'));
  let links=0;
  for(const file of files) {
    const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
    function visit(node) {
      if(ts.isJsxAttribute(node)&&node.name.getText(source)==='href'&&node.initializer) {
        const value=ts.isStringLiteral(node.initializer)?node.initializer.text:ts.isJsxExpression(node.initializer)&&node.initializer.expression&&ts.isStringLiteral(node.initializer.expression)?node.initializer.expression.text:null;
        if(value?.startsWith('/')&&!value.startsWith('//')) {
          const route=value.split(/[?#]/)[0],directory=path.join(root,'app',route);links++;
          assert(['page.tsx','route.ts'].some(name=>fs.existsSync(path.join(directory,name))),`${path.relative(root,file)} -> ${route}`);
        }
      }
      ts.forEachChild(node,visit);
    }visit(source);
  }
  assert(links>20);
  const visited=new Set();
  function visitImports(file) {
    if(visited.has(file))return;visited.add(file);
    assert(!/mock-data|NowCard|FlexibleActivityCard|GoalCard|deploy-button|\/tutorial\//.test(file.replaceAll('\\','/')),file);
    const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
    for(const statement of source.statements)if(ts.isImportDeclaration(statement)) {
      const specifier=statement.moduleSpecifier.text;
      if(!specifier.startsWith('.')&&!specifier.startsWith('@/'))continue;
      const base=specifier.startsWith('@/')?path.join(root,specifier.slice(2)):path.resolve(path.dirname(file),specifier);
      const target=[base+'.ts',base+'.tsx',path.join(base,'index.ts'),path.join(base,'index.tsx')].find(candidate=>fs.existsSync(candidate));
      if(target)visitImports(target);
    }
  }
  for(const file of files.filter(file=>file.startsWith(path.join(root,'app'))))visitImports(file);
});
