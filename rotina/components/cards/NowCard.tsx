export function NowCard() {
  return (
    <section aria-label="Atividade em andamento" className="rounded-2xl border border-primary/20 bg-primary-soft p-5 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
        Agora
      </p>

      {/* Dados fictícios para apresentação; sem lógica de agenda. */}
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">Trabalho</h2>
        <p className="text-sm text-muted-foreground">Até 15:00</p>
        <div className="mt-2 rounded-xl bg-surface/70 px-3 py-2 text-sm text-muted-foreground">
          Próximo: passeio dos cachorros · 15:00–15:40
        </div>
      </div>
    </section>
  );
}
