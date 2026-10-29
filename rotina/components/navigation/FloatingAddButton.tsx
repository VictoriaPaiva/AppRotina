"use client";

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function FloatingAddButton() {
  const pathname=usePathname();
  if(pathname.startsWith('/auth/'))return null;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" aria-label="Adicionar algo" data-global-fab className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-3xl text-primary-foreground shadow-lg transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background xl:bottom-6 xl:right-6 xl:z-50">
        <span aria-hidden="true">+</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" side="top" sideOffset={8} collisionPadding={16} className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl">
      <DropdownMenuLabel>Adicionar algo</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild><Link href="/banco-mestre/nova">Item da rotina</Link></DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild><Link href="/projetos/nova">Projeto</Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link href="/ideias/nova">Ideia</Link></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
