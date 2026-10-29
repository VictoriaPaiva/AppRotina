/* eslint-disable @typescript-eslint/no-require-imports -- Responsive navigation and presentation contracts. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {withStubs}=require('./helpers/load-with-stubs.cjs'),{load}=require('./helpers/load-typescript.cjs');
const group=({children})=>React.createElement(React.Fragment,null,children);
test('narrow navigation keeps all seven areas, account and the same three creation destinations',()=>{
  const shared={'next/link':{default:'a'},'next/navigation':{usePathname:()=>'/financas'},'@/components/ui/button':{Button:'button'},
    '@/components/ui/dropdown-menu':Object.fromEntries(['DropdownMenu','DropdownMenuContent','DropdownMenuItem','DropdownMenuTrigger','DropdownMenuLabel','DropdownMenuSeparator'].map(k=>[k,group]))};
  const {FloatingAddButton}=withStubs('components/navigation/FloatingAddButton.tsx',shared);
  const {BottomNavigation}=withStubs('components/navigation/BottomNavigation.tsx',{...shared,'./FloatingAddButton':{FloatingAddButton},'@/components/theme/ThemeToggle':{ThemeToggle:({menuItem})=>React.createElement('span',null,menuItem?'Tema no menu':'Tema')}});
  const navigation=renderToStaticMarkup(React.createElement(BottomNavigation));
  assert(!navigation.includes('aria-label="Adicionar algo"'));
  const fab=renderToStaticMarkup(React.createElement(FloatingAddButton));
  assert(fab.includes('data-global-fab'));assert(fab.includes('safe-area-inset-bottom'));assert(fab.includes('safe-area-inset-right'));
  const html=navigation+fab;
  for(const route of ['/hoje','/planejamento','/calendario','/projetos','/banco-mestre','/ideias','/financas','/conta','/banco-mestre/nova','/projetos/nova','/ideias/nova'])assert(html.includes('href="'+route+'"'),route);
  assert(html.includes('Tema no menu'));assert(html.includes('aria-label="Adicionar algo"'));
});
test('theme can be selected through a real menu-item action, with the same light/dark setting',()=>{
  const selected=[];
  const {ThemeToggle}=withStubs('components/theme/ThemeToggle.tsx',{
    react:{useState:()=>[true,()=>{}],useEffect(){}},'next-themes':{useTheme:()=>({resolvedTheme:'dark',setTheme:v=>selected.push(v)})},
    'lucide-react':{Sun:'svg',Moon:'svg'},'@/components/ui/dropdown-menu':{DropdownMenuItem:'menuitem'},
  });
  const item=ThemeToggle({menuItem:true});assert.equal(item.type,'menuitem');assert.equal(item.props.disabled,false);item.props.onSelect();assert.deepEqual(selected,['light']);assert(item.props['aria-label'].includes('claro'));
});

test('FAB keeps a 56px target, collision-aware menu and the same keyboard-accessible destinations',()=>{
  const {FloatingAddButton}=withStubs('components/navigation/FloatingAddButton.tsx',{
    'next/link':{default:'a'},'next/navigation':{usePathname:()=>'/hoje'},'@/components/ui/button':{Button:'button'},
    '@/components/ui/dropdown-menu':Object.fromEntries(['DropdownMenu','DropdownMenuContent','DropdownMenuItem','DropdownMenuTrigger','DropdownMenuLabel','DropdownMenuSeparator'].map(k=>[k,k])),
  });
  const tree=FloatingAddButton(),children=React.Children.toArray(tree.props.children);
  const trigger=children.find(e=>e.type==='DropdownMenuTrigger').props.children;
  assert.equal(trigger.props.type,'button');assert.equal(trigger.props['aria-label'],'Adicionar algo');
  assert(trigger.props.className.includes('h-14 w-14'));assert(trigger.props.className.includes('xl:bottom-6 xl:right-6 xl:z-50'));
  const menu=children.find(e=>e.type==='DropdownMenuContent');
  assert.equal(menu.props.side,'top');assert.equal(menu.props.align,'end');assert.equal(menu.props.collisionPadding,16);
  assert(menu.props.className.includes('--radix-dropdown-menu-content-available-height'));
  const links=React.Children.toArray(menu.props.children).filter(e=>e.type==='DropdownMenuItem').map(e=>e.props.children.props.href);
  assert.deepEqual(links,['/banco-mestre/nova','/projetos/nova','/ideias/nova']);
});
test('responsive finance uses one semantic transaction set, exact cents, labels and the original edit route',()=>{
  const {FinanceOverview}=withStubs('components/finance/FinanceOverview.tsx',{
    'next/link':{default:'a'},'@/components/ui/button':{Button:group},'@/lib/finance/summary':load('lib/finance/summary.ts'),'@/lib/planning/dates':load('lib/planning/dates.ts'),
  });
  const transaction={id:'10000000-0000-4000-8000-000000000001',type:'expense',date:'2026-10-28',amountCents:21347,description:'Luz & serviços',category:'Moradia',fixedExpenseMonthId:null,createdAt:'2026-10-28T12:00:00Z',updatedAt:'2026-10-28T12:00:00Z'};
  const html=renderToStaticMarkup(React.createElement(FinanceOverview,{month:'2026-10',transactions:[transaction]}));
  const body=html.split('<tbody')[1].split('</tbody>')[0];
  assert.equal((body.match(/role="row"/g)||[]).length,1);assert.equal((body.match(/role="cell"/g)||[]).length,6);assert.equal((body.match(/R\$ 213,47/g)||[]).length,1);assert(body.includes('/financas/'+transaction.id));assert(body.includes('Luz &amp; serviços'));assert(html.includes('role="columnheader"'));
});
