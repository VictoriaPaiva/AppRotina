"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const items = [
  { href: "/hoje", label: "Hoje" },
  { href: "/planejamento", label: "Planejamento" },
  { href: "/calendario", label: "Calendário" },
  { href: "/projetos", label: "Projetos" },
  { href: "/banco-mestre", label: "Banco Mestre" },
  { href: "/ideias", label: "Ideias" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden min-h-screen w-64 border-r p-4 md:block"
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

      <nav className="space-y-2">
        {items.map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-xl px-4 py-3 transition ${
                active
                  ? "bg-[var(--primary-soft)] font-medium text-[var(--primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]"
              }`}
            >
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
