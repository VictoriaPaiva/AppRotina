"use client";

import { LogoutButton } from '@/components/logout-button';
import { Search, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const pageTitles: Record<string, string> = {
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
  const title = pageTitles[pathname] ?? (pathname.startsWith("/banco-mestre/") ? "Banco Mestre" : undefined);

  if (!title) return null;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface text-foreground">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-8">
        <h1 className="min-w-0 break-words text-lg font-semibold md:text-xl">
          {title}
        </h1>

        <div className="flex shrink-0 items-center gap-2" role="group" aria-label="Ações globais">
          <LogoutButton variant="ghost" size="icon" />
          {/* Placeholders: busca e configurações ainda não implementadas. */}
          <Button type="button" variant="ghost" size="icon" disabled aria-label="Buscar" title="Buscar">
            <Search aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled aria-label="Configurações" title="Configurações">
            <Settings aria-hidden="true" />
          </Button>
        </div>
      </div>
    </header>
  );
}
