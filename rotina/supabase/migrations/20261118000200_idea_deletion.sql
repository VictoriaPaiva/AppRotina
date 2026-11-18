-- Permanent deletion of an independent idea, restricted to its authenticated owner.
grant delete on table public.ideas to authenticated;
create policy ideas_delete on public.ideas for delete to authenticated
  using (user_id = (select auth.uid()));
