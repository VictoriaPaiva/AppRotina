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
      <DropdownMenuLabel>O que você quer adicionar?</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild><Link href="/banco-mestre/nova?category=checklist">Tarefa / checklist</Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link href="/banco-mestre/nova?category=routine">Rotina</Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link href="/banco-mestre/nova?category=punctual">Atividade pontual</Link></DropdownMenuItem>
      <DropdownMenuSeparator />
      {['Compromisso', 'Projeto', 'Ideia'].map(label => <DropdownMenuItem key={label} disabled>{label}<span className="ml-auto text-xs">Em breve</span></DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}
