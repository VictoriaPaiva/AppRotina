"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const items = [
  { href: "/hoje", label: "Hoje" },
  { href: "/calendario", label: "Calendário" },
  { href: "/projetos", label: "Projetos" },
];

const moreItems = [
  { href: "/planejamento", label: "Planejamento" },
  { href: "/banco-mestre", label: "Banco Mestre" },
  { href: "/ideias", label: "Ideias" },
  { href: "/financas", label: "Finanças" },
  { href: "/conta", label: "Minha conta" },
];

export function BottomNavigation() {
  const pathname = usePathname();
  if(pathname.startsWith('/auth/'))return null;
  const moreActive = moreItems.some((item) => (pathname === item.href || pathname.startsWith(item.href + "/")));

  return (
    <nav
      aria-label="Navegação principal mobile"
      data-mobile-navigation
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center border-t bg-card pb-[env(safe-area-inset-bottom)] xl:hidden"
    >
      {items.map((item) => {
        const active = (pathname === item.href || pathname.startsWith(item.href + "/"));

        return (
            <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 rounded-md px-2 py-3 text-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              active ? "font-medium text-primary" : "text-muted-foreground"
            }`}
          >
            {item.label}
            </Link>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label="Mais páginas e opções"
            className={`h-auto flex-1 px-2 py-3 font-normal focus-visible:ring-inset ${
              moreActive ? "font-medium text-primary" : "text-muted-foreground"
            }`}
          >
            Mais
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" sideOffset={8} className="z-[60] min-w-48 max-w-[calc(100vw-1rem)]" aria-label="Mais páginas e opções">
          {moreItems.map((item) => {
            const active = (pathname === item.href || pathname.startsWith(item.href + "/"));
            return (
              <DropdownMenuItem key={item.href} asChild className={active ? "bg-primary-soft font-medium text-primary" : undefined}>
                <Link href={item.href} aria-current={active ? "page" : undefined}>
                  {item.label}
                </Link>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator/>
          <ThemeToggle menuItem/>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
