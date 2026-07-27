-- Server-backed, realtime state for the partner-battle organizer so the draw
-- and scoreboard sync across every device viewing a tournament. The host's
-- device writes the whole state blob; everyone else reads it live.

create table if not exists public.partner_battles (
  tournament_id uuid primary key references public.tournaments (id) on delete cascade,
  state jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

alter table public.partner_battles enable row level security;

create policy "partner battles are public" on public.partner_battles
  for select using (true);

create policy "host inserts partner battle" on public.partner_battles
  for insert with check (
    exists (select 1 from public.tournaments t where t.id = tournament_id and t.host = auth.uid())
  );

create policy "host updates partner battle" on public.partner_battles
  for update using (
    exists (select 1 from public.tournaments t where t.id = tournament_id and t.host = auth.uid())
  ) with check (
    exists (select 1 from public.tournaments t where t.id = tournament_id and t.host = auth.uid())
  );

grant select on public.partner_battles to anon, authenticated;
grant insert, update on public.partner_battles to authenticated;

-- Broadcast row changes over Supabase realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'partner_battles'
  ) then
    alter publication supabase_realtime add table public.partner_battles;
  end if;
end $$;
