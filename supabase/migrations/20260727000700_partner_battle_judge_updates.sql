-- Let BEYLIVE managers update the synced Partner Battle state.

drop policy if exists "host inserts partner battle" on public.partner_battles;
drop policy if exists "host updates partner battle" on public.partner_battles;

create policy "beylive managers insert partner battle" on public.partner_battles
  for insert with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.host = auth.uid()
    ) or exists (
      select 1 from public.beylive_judges j
      where j.tournament_id = tournament_id and j.user_id = auth.uid()
    )
  );

create policy "beylive managers update partner battle" on public.partner_battles
  for update using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.host = auth.uid()
    ) or exists (
      select 1 from public.beylive_judges j
      where j.tournament_id = tournament_id and j.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.host = auth.uid()
    ) or exists (
      select 1 from public.beylive_judges j
      where j.tournament_id = tournament_id and j.user_id = auth.uid()
    )
  );
