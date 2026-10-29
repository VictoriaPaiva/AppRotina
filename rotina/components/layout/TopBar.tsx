"use client";

import { LogoutButton } from '@/components/logout-button';
import { usePathname } from "next/navigation";
import Link from 'next/link';
import {UserRound} from 'lucide-react';

const pageTitles: Record<string, string> = {
  "/conta": "Minha conta",
  "/hoje": "Hoje",
  "/planejamento": "Planejamento",
  "/calendario": "Calendário",
  "/projetos": "Projetos",
  "/banco-mestre": "Banco Mestre",
  "/ideias": "Ideias",
  "/financas": "Finanças",
};

export function TopBar() {
  const pathname = usePathname();
  const title = Object.entries(pageTitles).find(([route]) => pathname === route || pathname.startsWith(route + '/'))?.[1];

  if (!title) return null;
  return <TopBarContent title={title}/>;
}
export function TopBarContent({title}:{title:string}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface text-foreground">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-8">
        <p className="min-w-0 break-words text-lg font-semibold md:text-xl">
          {title}
        </p>

        <div className="flex shrink-0 items-center gap-2" role="group" aria-label="Ações globais">
          <Link href="/conta" aria-label="Minha conta" title="Minha conta" className="inline-flex h-11 min-w-11 items-center justify-center rounded px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:h-auto sm:min-w-0 sm:py-2"><UserRound aria-hidden="true" className="h-5 w-5 sm:hidden"/><span className="hidden sm:inline">Minha conta</span></Link>
          <LogoutButton variant="ghost" size="icon" />
        </div>
      </div>
    </header>
  );
}
