"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function FloatingAddButton() {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" aria-label="Adicionar algo" className="fixed bottom-20 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-3xl text-primary-foreground shadow-lg transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:bottom-6 md:right-6">
        <span aria-hidden="true">+</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" side="top" sideOffset={8} className="w-64 max-w-[calc(100vw-2rem)] rounded-xl">
      <DropdownMenuLabel>Adicionar algo</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild><Link href="/banco-mestre/nova">Item da rotina</Link></DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild><Link href="/projetos/nova">Projeto</Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link href="/ideias/nova">Ideia</Link></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
