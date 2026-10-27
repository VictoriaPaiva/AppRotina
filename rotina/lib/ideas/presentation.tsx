import Link from 'next/link';
import type { Idea } from './contracts';
export function ideaPreview(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  const chars = Array.from(compact);
  return chars.length > 180 ? chars.slice(0, 180).join('') + '…' : compact;
}
export function formatIdeaDate(timestamp: string): string {
  return new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'}).format(new Date(timestamp));
}
export function IdeaList({ideas}: {ideas: Idea[]}) {
  return !ideas.length ? <p className="text-muted-foreground">Você ainda não tem ideias. Use Nova ideia para registrar a primeira.</p> : <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{ideas.map(idea => <li key={idea.id} className="min-w-0">
    <Link href={`/ideias/${idea.id}`} className="block h-full space-y-3 rounded-lg border bg-card p-5 hover:bg-muted focus-visible:outline focus-visible:outline-2">
      <h2 className="break-words text-lg font-semibold">{idea.title}</h2>
      <p className="break-words text-sm text-muted-foreground">{ideaPreview(idea.content) || 'Sem conteúdo.'}</p>
      <p className="text-xs text-muted-foreground">Atualizada em <time dateTime={idea.updatedAt}>{formatIdeaDate(idea.updatedAt)}</time></p>
    </Link>
  </li>)}</ul>;
}
