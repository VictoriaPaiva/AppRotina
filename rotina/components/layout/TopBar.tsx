"use client";

import { LogoutButton } from '@/components/logout-button';
import { usePathname } from "next/navigation";
import Link from 'next/link';

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

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface text-foreground">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-8">
        <h1 className="min-w-0 break-words text-lg font-semibold md:text-xl">
          {title}
        </h1>

        <div className="flex shrink-0 items-center gap-2" role="group" aria-label="Ações globais">
          <Link href="/conta" className="rounded px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Minha conta</Link>
          <LogoutButton variant="ghost" size="icon" />
        </div>
      </div>
    </header>
  );
}
