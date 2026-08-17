-- Tournament creation is an approved-host action. Existing hosts can still
-- manage their own tournaments; this only blocks new tournament inserts from
-- ordinary logged-in accounts.

drop policy if exists "host own tournament" on public.tournaments;
create policy "superadmin hosts tournaments" on public.tournaments
  for insert with check (
    auth.uid() = host
    and exists (
      select 1
      from public.superadmins sa
      where sa.user_id = auth.uid()
    )
  );
