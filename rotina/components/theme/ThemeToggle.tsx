"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import {DropdownMenuItem} from '@/components/ui/dropdown-menu';

export function ThemeToggle({ compact = false,menuItem=false }: { compact?: boolean;menuItem?:boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const dark = mounted && resolvedTheme === "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  function toggleTheme() {
    setTheme(dark ? "light" : "dark");
  }
  if(menuItem)return <DropdownMenuItem disabled={!mounted} onSelect={toggleTheme} aria-label={dark?'Ativar modo claro':'Ativar modo escuro'}>
    {dark?<Sun size={18} aria-hidden="true"/>:<Moon size={18} aria-hidden="true"/>}<span>{dark?'Modo claro':'Modo escuro'}</span>
  </DropdownMenuItem>;

  return (
    <button
      type="button"
      disabled={!mounted}
      onClick={toggleTheme}
      aria-label={dark ? "Ativar modo claro" : "Ativar modo escuro"}
      className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      <span className={compact ? "sr-only" : undefined}>
        {dark ? "Modo claro" : "Modo escuro"}
      </span>
    </button>
  );
}
