import { NowCard } from "@/components/cards/NowCard";
import { FlexibleActivityCard } from "@/components/cards/FlexibleActivityCard";
import { ProjectCard } from "@/components/cards/ProjectCard";
import { GoalCard } from "@/components/cards/GoalCard";
import { SectionTitle } from "@/components/ui/SectionTitle";

export default function HojePage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">
          Sábado, 10 de outubro
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
            ].map((item) => (
              <label
                key={item}
                className="flex cursor-pointer items-center gap-3"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                />

                <span className="text-sm text-foreground">
                  {item}
                </span>
              </label>
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

          <button className="text-sm font-medium text-warning">
            Ver
          </button>
        </div>
      </section>
    </div>
  );
}
