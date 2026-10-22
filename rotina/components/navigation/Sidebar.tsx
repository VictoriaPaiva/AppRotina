"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Wallet } from "lucide-react";

const items = [
  { href: "/hoje", label: "Hoje" },
  { href: "/planejamento", label: "Planejamento" },
  { href: "/calendario", label: "Calendário" },
  { href: "/projetos", label: "Projetos" },
  { href: "/banco-mestre", label: "Banco Mestre" },
  { href: "/ideias", label: "Ideias" },
  { href: "/financas", label: "Finanças" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden min-h-screen w-64 shrink-0 border-r p-4 md:block"
      style={{
        background: "var(--surface)",
        color: "var(--text-primary)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="mb-8 text-2xl font-bold"
        style={{ color: "var(--primary)" }}
      >
        Rotina
      </div>

      <nav aria-label="Navegação principal desktop" className="space-y-2">
        {items.map((item) => {
          const active = (pathname === item.href || pathname.startsWith(item.href + "/"));

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`block rounded-xl px-4 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "bg-[var(--primary-soft)] font-medium text-[var(--primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]"
              }`}
            >
              {item.href === "/financas" && <Wallet aria-hidden="true" className="mr-2 inline-block h-4 w-4" />}
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-8">
        <ThemeToggle />
      </div>
    </aside>
  );
}
