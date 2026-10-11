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
          <span>{progress}%</span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-surface-soft">
          <div
            className="h-full rounded-full bg-project"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Sessão ideal: {session}
      </p>

      <div className="flex flex-wrap gap-2">
        <button className="rounded-xl bg-project px-4 py-2 text-sm font-medium text-project-foreground hover:bg-project-hover">
          Iniciar sessão
        </button>

        <button className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">
          Subtarefas
        </button>
      </div>
    </article>
  );
}
