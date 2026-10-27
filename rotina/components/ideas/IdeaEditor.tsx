'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createIdea, updateIdea } from '@/app/ideias/actions';
import type { Idea, IdeaResult } from '@/lib/ideas/contracts';
import { IDEA_TITLE_LIMIT, IDEA_CONTENT_LIMIT } from '@/lib/ideas/validation';
import { formatIdeaDate } from '@/lib/ideas/presentation';

export function IdeaEditor({idea}: {idea?: Idea}) {
  const router = useRouter();
  const [title, setTitle] = useState(idea?.title ?? '');
  const [content, setContent] = useState(idea?.content ?? '');
  const [saved, setSaved] = useState(idea);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Extract<IdeaResult, {ok: false}> | null>(null);
  const [success, setSuccess] = useState(false);
  const saving = useRef(false), attemptId = useRef<string | null>(null), navigating = useRef(false);
  const dirty = title !== (saved?.title ?? '') || content !== (saved?.content ?? '');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || navigating.current) return;
    saving.current = true; setBusy(true); setFailure(null); setSuccess(false);
    try {
      attemptId.current ??= crypto.randomUUID();
      const input = {id: saved?.id ?? attemptId.current, title, content};
      const result = saved ? await updateIdea({...input, expectedUpdatedAt: saved.updatedAt}) : await createIdea(input);
      if (!result.ok) { setFailure(result); return; }
      setSaved(result.idea); setTitle(result.idea.title); setContent(result.idea.content); setSuccess(true);
      if (!saved) {
        navigating.current = true;
        router.replace(`/ideias/${result.idea.id}`); router.refresh();
      }
    } catch {
      setFailure({ok: false, kind: 'Unknown', message: 'Não foi possível confirmar o salvamento. Seu texto foi mantido. Consulte os dados salvos antes de tentar novamente.'});
    } finally { saving.current = false; setBusy(false); }
  }
  function reload() {
    if ((!dirty || window.confirm('Recarregar descarta o texto não salvo. Deseja continuar?'))) window.location.reload();
  }
  return <div className="mx-auto max-w-4xl space-y-5">
    <Link href="/ideias" className="text-sm underline">Voltar às ideias</Link>
    <h1 className="text-2xl font-semibold">{saved ? 'Editar ideia' : 'Nova ideia'}</h1>
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2"><Label htmlFor="idea-title">Título</Label><Input id="idea-title" required value={title} disabled={busy || navigating.current} onChange={event => {setTitle(event.target.value); setSuccess(false);}} aria-describedby="title-limit" /><p id="title-limit" className="text-xs text-muted-foreground">Até {IDEA_TITLE_LIMIT} caracteres.</p></div>
      <div className="space-y-2"><Label htmlFor="idea-content">Conteúdo</Label><textarea id="idea-content" value={content} disabled={busy || navigating.current} onChange={event => {setContent(event.target.value); setSuccess(false);}} rows={16} aria-describedby="content-limit" className="w-full resize-y rounded-md border border-input bg-background p-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" /><p id="content-limit" className="text-xs text-muted-foreground">Até {IDEA_CONTENT_LIMIT.toLocaleString('pt-BR')} caracteres. Conteúdo opcional.</p></div>
      {failure && <div role="alert" className="space-y-3"><p>{failure.message}</p><p className="text-sm">Seu texto foi mantido neste formulário.</p>{failure.kind === 'Unauthorized' && <Link className="block underline" href="/auth/login" target="_blank" rel="noopener noreferrer">Entrar novamente em outra aba</Link>}<Button type="button" variant="outline" onClick={reload}>Recarregar dados salvos</Button>{!saved && attemptId.current && <Link className="block underline" href={`/ideias/${attemptId.current}`} target="_blank" rel="noopener noreferrer">Consultar esta tentativa em outra aba</Link>}</div>}
      {success && <p role="status">Ideia salva.</p>}
      <div className="flex flex-wrap items-center gap-4"><Button type="submit" disabled={busy || navigating.current || !title.trim() || Array.from(title).length > IDEA_TITLE_LIMIT || Array.from(content).length > IDEA_CONTENT_LIMIT || (!!saved && !dirty)}>{busy ? 'Salvando…' : 'Salvar ideia'}</Button>{saved && <p className="text-sm text-muted-foreground">Atualizada em {formatIdeaDate(saved.updatedAt)}</p>}</div>
    </form>
  </div>;
}
