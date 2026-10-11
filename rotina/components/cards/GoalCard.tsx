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
  const progress = Math.min((current / target) * 100, 100);

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

      <div className="h-2 overflow-hidden rounded-full bg-surface-soft">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${progress}%` }}
        />
      </div>
    </article>
  );
}
