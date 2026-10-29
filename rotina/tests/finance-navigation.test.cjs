/* eslint-disable @typescript-eslint/no-require-imports -- Local Node rendering tests. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {withStubs}=require('./helpers/load-with-stubs.cjs');

test('Finanças appears as the active desktop destination with a decorative Wallet icon',()=>{
  const {Sidebar}=withStubs('components/navigation/Sidebar.tsx',{
    'next/link':{default:({children,...props})=>React.createElement('a',props,children)},
    'next/navigation':{usePathname:()=>'/financas'},
    '@/components/theme/ThemeToggle':{ThemeToggle:()=>null},
    'lucide-react':{Wallet:props=>React.createElement('svg',props)},
  });
  const html=renderToStaticMarkup(React.createElement(Sidebar));
  assert.match(html,/href="\/financas" aria-current="page"/);
  assert.match(html,/aria-hidden="true"/);
  assert.match(html,/Finanças/);
});

test('Finanças is reachable from mobile Mais and has its own page title',()=>{
  const group=({children})=>React.createElement(React.Fragment,null,children);
  const shared={
    'next/navigation':{usePathname:()=>'/financas'},
    '@/components/ui/button':{Button:group},
  };
  const {BottomNavigation}=withStubs('components/navigation/BottomNavigation.tsx',{
    ...shared,
    'next/link':{default:({children,...props})=>React.createElement('a',props,children)},
    '@/components/theme/ThemeToggle':{ThemeToggle:()=>null},
    './FloatingAddButton':{FloatingAddButton:()=>null},
    '@/components/ui/dropdown-menu':Object.fromEntries(['DropdownMenu','DropdownMenuContent','DropdownMenuItem','DropdownMenuSeparator','DropdownMenuTrigger'].map(name=>[name,group])),
  });
  const html=renderToStaticMarkup(React.createElement(BottomNavigation));
  assert.match(html,/href="\/financas" aria-current="page">Finanças/);
  const {TopBar}=withStubs('components/layout/TopBar.tsx',{
    'next/link':{default:'a'},
    ...shared,
    '@/components/logout-button':{LogoutButton:()=>null},
    'lucide-react':{Search:()=>null,Settings:()=>null,UserRound:'svg'},
  });
  assert.match(renderToStaticMarkup(React.createElement(TopBar)),/<p[^>]*>Finanças<\/p>/);
});
