type GoalCardProps = {
  title: string;
  current: number;
  target: number;
  unit: string;
};

export function GoalCard({
  title,
  current,
  target,
  unit,
}: GoalCardProps) {
  const ratio = target > 0 ? (current / target) * 100 : 0;
  const progress = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 100) : 0;

  return (
    <article
  className="rounded-2xl border p-4 shadow-sm"
  style={{
    background: "var(--surface)",
    borderColor: "var(--border)",
  }}
>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">
          {title}
        </h3>

        <span className="text-xs text-muted-foreground">
          {current} / {target} {unit}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={`Progresso da meta ${title}`}
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${current} de ${target} ${unit}`}
        className="h-2 overflow-hidden rounded-full bg-surface-soft"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${progress}%` }}
        />
      </div>
    </article>
  );
}
