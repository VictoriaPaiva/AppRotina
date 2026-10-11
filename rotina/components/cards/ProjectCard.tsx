import { Button } from "@/components/ui/button";

type ProjectCardProps = {
  title: string;
  progress: number;
  session: string;
};

export function ProjectCard({
  title,
  progress,
  session,
}: ProjectCardProps) {
  const percentage = Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 100) : 0;

  return (
    <article className="rounded-2xl border border-project-border bg-card p-5 shadow-sm">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-project">
          Projeto
        </p>

        <h3 className="mt-1 text-base font-semibold text-foreground">
          {title}
        </h3>
      </div>

      <div className="mb-3">
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>Progresso</span>
          <span>{percentage}%</span>
        </div>

        <div
          role="progressbar"
          aria-label={`Progresso do projeto ${title}`}
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 overflow-hidden rounded-full bg-surface-soft"
        >
          <div
            className="h-full rounded-full bg-project"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Sessão ideal: {session}
      </p>

      {/* Placeholder: ações aguardam a implementação dos fluxos de projetos. */}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-auto rounded-xl bg-project px-4 py-2 text-project-foreground hover:bg-project-hover focus-visible:ring-project">
          Iniciar sessão
        </Button>

        <Button type="button" variant="outline" className="h-auto rounded-xl bg-surface px-4 py-2">
          Subtarefas
        </Button>
      </div>
    </article>
  );
}
