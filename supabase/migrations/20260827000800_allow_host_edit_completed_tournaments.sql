-- Hosts can reopen the edit form for completed test events from the UI.
-- Let those saves persist instead of silently rejecting registration setting changes.

drop policy if exists "host updates own tournament" on public.tournaments;

create policy "host updates own tournament" on public.tournaments
  for update
  using (auth.uid() = host)
  with check (
    auth.uid() = host
    and status in ('open', 'started', 'completed', 'cancelled')
  );
