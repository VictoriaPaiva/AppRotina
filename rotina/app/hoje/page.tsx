import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { connection } from "next/server";
import { NowCard } from "@/components/cards/NowCard";
import { FlexibleActivityCard } from "@/components/cards/FlexibleActivityCard";
import { ProjectCard } from "@/components/cards/ProjectCard";
import { GoalCard } from "@/components/cards/GoalCard";
import { SectionTitle } from "@/components/ui/SectionTitle";



async function TodayDate() {
  await connection();
  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const todayLabel = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
  return <>{todayLabel}</>;
}

export default function HojePage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">
          <Suspense fallback={<span aria-hidden="true">&nbsp;</span>}>
            <TodayDate />
          </Suspense>
        </p>

      </header>

      <NowCard />

      <section>
        <SectionTitle>Para hoje</SectionTitle>

        <div className="grid gap-4 xl:grid-cols-2">
          <FlexibleActivityCard
            title="Academia"
            duration="30–40 min"
            meta="Meta semanal: 1 / 3"
          />

          <ProjectCard
            title="Tarot"
            progress={24}
            session="1–2h"
          />
        </div>
      </section>

      <section>
        <SectionTitle>Metas</SectionTitle>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <GoalCard
            title="Água"
            current={1.8}
            target={2.5}
            unit="L"
          />

          <GoalCard
            title="Foco"
            current={2}
            target={3}
            unit="h"
          />

          <GoalCard
            title="Academia"
            current={1}
            target={3}
            unit="sessões"
          />
        </div>
      </section>

      <section>
        <SectionTitle>Checklist</SectionTitle>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="space-y-3">
            {[
              "Arrumar cama",
              "Escovar os dentes",
              "Fio dental",
            ].map((item, index) => (
              <div key={item} className="flex items-center gap-3">
                <Checkbox id={`today-checklist-${index}`} />

                <Label htmlFor={`today-checklist-${index}`} className="cursor-pointer text-sm font-normal text-foreground">
                  {item}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>Pendências</SectionTitle>

        <div className="flex items-center justify-between rounded-2xl border border-warning-border bg-warning-soft p-4">
          <div>
            <p className="font-medium text-foreground">
              1 pendência
            </p>

            <p className="text-sm text-muted-foreground">
              Existe uma atividade que precisa da sua atenção.
            </p>
          </div>

          {/* Placeholder: visualização de pendências ainda não implementada. */}
          <Button type="button" variant="ghost" size="sm" className="text-warning hover:text-warning">
            Ver
          </Button>
        </div>
      </section>
    </div>
  );
}
