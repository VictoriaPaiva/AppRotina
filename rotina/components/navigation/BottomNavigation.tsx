"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const items = [
  { href: "/hoje", label: "Hoje" },
  { href: "/calendario", label: "Calendário" },
  { href: "/projetos", label: "Projetos" },
  { href: "/planejamento", label: "Mais" },
];

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center border-t bg-card md:hidden"
    >
      {items.map((item) => {
        const active = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 px-2 py-3 text-center text-sm ${
              active
                ? "font-medium text-primary"
                : "text-muted-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
      <div className="px-2">
        <ThemeToggle compact />
      </div>
    </nav>
  );
}
