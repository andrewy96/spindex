-- Tighten battle-board writes after the initial feature migration.

-- Challenge creators must post a real open challenge and be able to cover it.
drop policy if exists "post own challenge" on public.challenges;
create policy "post covered open challenge" on public.challenges
  for insert with check (
    auth.uid() = host
    and status = 'open'
    and opponent is null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.stars >= wager
    )
  );

-- Hosts may only cancel their own still-open challenges through the API.
drop policy if exists "host cancels own open challenge" on public.challenges;
create policy "host cancels own open challenge" on public.challenges
  for update using (auth.uid() = host and status = 'open')
  with check (auth.uid() = host and status = 'cancelled' and opponent is null);

revoke insert, update on public.challenges from anon, authenticated;
grant insert (host, city, venue, battle_at, wager, note) on public.challenges to authenticated;
grant update (status) on public.challenges to authenticated;

-- Accepting a challenge also requires the host to still cover the wager.
create or replace function public.accept_challenge(cid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare c challenges;
begin
  select * into c from challenges where id = cid for update;
  if c is null then raise exception 'challenge_not_found'; end if;
  if c.status <> 'open' then raise exception 'challenge_not_open'; end if;
  if c.host = auth.uid() then raise exception 'cannot_accept_own'; end if;
  if (select stars from profiles where id = c.host) < c.wager then
    raise exception 'host_not_enough_stars';
  end if;
  if (select stars from profiles where id = auth.uid()) < c.wager then
    raise exception 'not_enough_stars';
  end if;
  update challenges set opponent = auth.uid(), status = 'accepted' where id = cid;
end $$;

-- Reported scores must match a valid round log.
create or replace function public.report_match(cid uuid, p_rounds jsonb, s_host int, s_opp int)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c challenges;
  mid uuid;
  r jsonb;
  side int;
  finish text;
  pts int;
  calc_host int := 0;
  calc_opp int := 0;
begin
  select * into c from challenges where id = cid for update;
  if c is null then raise exception 'challenge_not_found'; end if;
  if c.status <> 'accepted' then raise exception 'challenge_not_accepted'; end if;
  if auth.uid() <> c.host and auth.uid() <> c.opponent then
    raise exception 'not_a_participant';
  end if;

  p_rounds := coalesce(p_rounds, '[]'::jsonb);
  if jsonb_typeof(p_rounds) <> 'array' then raise exception 'invalid_rounds'; end if;

  for r in select value from jsonb_array_elements(p_rounds) loop
    if coalesce(r->>'side', '') not in ('1', '2') then
      raise exception 'invalid_rounds';
    end if;
    if coalesce(r->>'pts', '') !~ '^[0-9]+$' then
      raise exception 'invalid_rounds';
    end if;

    side := (r->>'side')::int;
    finish := r->>'finish';
    pts := (r->>'pts')::int;

    if not (
      (finish = 'spin' and pts = 1)
      or (finish in ('over', 'burst') and pts = 2)
      or (finish = 'xtreme' and pts = 3)
    ) then
      raise exception 'invalid_rounds';
    end if;

    if side = 1 then
      calc_host := calc_host + pts;
    else
      calc_opp := calc_opp + pts;
    end if;
  end loop;

  if calc_host <> s_host or calc_opp <> s_opp then raise exception 'invalid_score'; end if;
  if s_host = s_opp then raise exception 'no_draws'; end if;
  if s_host < 0 or s_opp < 0 or greatest(s_host, s_opp) < 4 then
    raise exception 'invalid_score';
  end if;
  if greatest(s_host, s_opp) > 6 or least(s_host, s_opp) >= 4 then
    raise exception 'invalid_score';
  end if;

  insert into matches (challenge_id, p1, p2, p1_score, p2_score, rounds, winner, wager, reported_by)
  values (
    cid, c.host, c.opponent, s_host, s_opp, p_rounds,
    case when s_host > s_opp then c.host else c.opponent end,
    c.wager, auth.uid()
  )
  returning id into mid;

  update challenges set status = 'completed' where id = cid;
  return mid;
end $$;
