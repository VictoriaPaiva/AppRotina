import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type FlexibleActivityCardProps = {
  title: string;
  duration: string;
  meta?: string;
  importance?: "Obrigatório" | "Importante" | "Opcional";
};

const importanceStyles = {
  Obrigatório: "border-destructive/20 bg-destructive/10 text-destructive",
  Importante: "border-warning-border bg-warning-soft text-warning",
  Opcional: "border-border bg-surface-soft text-muted-foreground",
} as const;

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

        <Badge variant="outline" className={`rounded-full py-1 font-medium ${importanceStyles[importance]}`}>
          {importance}
        </Badge>
      </div>

      {meta && (
        <p className="mb-4 text-sm text-muted-foreground">
          {meta}
        </p>
      )}

      {/* Placeholder: ações aguardam a implementação dos fluxos de atividades. */}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-auto rounded-xl px-4 py-2 hover:bg-primary-hover">
          Fazer agora
        </Button>

        <Button type="button" variant="outline" className="h-auto rounded-xl bg-surface px-4 py-2">
          Planejar
        </Button>
      </div>
    </article>
  );
}
