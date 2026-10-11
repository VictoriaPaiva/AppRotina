export function NowCard() {
  return (
    <section className="rounded-2xl border border-primary/20 bg-primary-soft p-5 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
        Agora
      </p>

      <div className="flex flex-col gap-2">
        <h2
  className="text-xl font-semibold"
  style={{ color: "var(--text-primary)" }}
></h2>

        <p
  className="text-sm"
  style={{ color: "var(--text-secondary)" }}
></p>

        <div className="mt-2 rounded-xl bg-surface/70 px-3 py-2 text-sm text-muted-foreground">
          Próximo: passeio dos cachorros · 13:00–14:40
        </div>
      </div>
    </section>
  );
}