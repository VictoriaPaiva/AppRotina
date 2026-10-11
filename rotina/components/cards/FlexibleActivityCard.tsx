type FlexibleActivityCardProps = {
  title: string;
  duration: string;
  meta?: string;
  importance?: "Obrigatório" | "Importante" | "Opcional";
};

export function FlexibleActivityCard({
  title,
  duration,
  meta,
  importance = "Importante",
}: FlexibleActivityCardProps) {
  return (
    <article
  className="rounded-2xl border p-5 shadow-sm"
  style={{
    background: "var(--surface)",
    borderColor: "var(--border)",
  }}
>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3
  className="text-base font-semibold"
  style={{ color: "var(--text-primary)" }}
>
            {title}
          </h3>

          <p
  className="mt-1 text-sm"
  style={{ color: "var(--text-secondary)" }}
>
            {duration} · Flexível
          </p>
        </div>

        <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
          {importance}
        </span>
      </div>

      {meta && (
        <p className="mb-4 text-sm text-muted-foreground">
          {meta}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
          Fazer agora
        </button>

        <button className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">
          Planejar
        </button>
      </div>
    </article>
  );
}
