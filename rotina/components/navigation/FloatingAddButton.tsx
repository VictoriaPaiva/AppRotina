export function FloatingAddButton() {
  return (
    <button
      type="button"
      className="fixed bottom-20 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-3xl text-primary-foreground shadow-lg transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:bottom-6 md:right-6"
      aria-label="Adicionar"
    >
      +
    </button>
  );
}
