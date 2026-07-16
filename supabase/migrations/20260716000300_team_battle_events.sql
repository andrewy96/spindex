-- Team-event battle settings and configurable win scores.

alter table public.challenges
  add column if not exists format text not null default 'single'
    check (format in ('single', 'team')),
  add column if not exists team_size int not null default 1
    check (team_size between 1 and 20),
  add column if not exists target_score int not null default 4
    check (target_score between 1 and 30);

alter table public.matches
  add column if not exists format text not null default 'single'
    check (format in ('single', 'team')),
  add column if not exists team_size int not null default 1
    check (team_size between 1 and 20),
  add column if not exists target_score int not null default 4
    check (target_score between 1 and 30);

drop policy if exists "post covered open challenge" on public.challenges;
create policy "post covered open challenge" on public.challenges
  for insert with check (
    auth.uid() = host
    and status = 'open'
    and opponent is null
    and (
      (format = 'single' and team_size = 1)
      or (format = 'team' and team_size between 2 and 20)
    )
    and target_score between 1 and 30
    and wager >= team_size
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.stars >= wager
    )
  );

grant insert (format, team_size, target_score) on public.challenges to authenticated;

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
    if calc_host >= c.target_score or calc_opp >= c.target_score then
      raise exception 'invalid_rounds';
    end if;
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
  if s_host < 0 or s_opp < 0 or greatest(s_host, s_opp) < c.target_score then
    raise exception 'invalid_score';
  end if;
  if least(s_host, s_opp) >= c.target_score or greatest(s_host, s_opp) > c.target_score + 2 then
    raise exception 'invalid_score';
  end if;

  insert into matches (
    challenge_id,
    p1,
    p2,
    p1_score,
    p2_score,
    rounds,
    winner,
    wager,
    reported_by,
    format,
    team_size,
    target_score
  )
  values (
    cid,
    c.host,
    c.opponent,
    s_host,
    s_opp,
    p_rounds,
    case when s_host > s_opp then c.host else c.opponent end,
    c.wager,
    auth.uid(),
    c.format,
    c.team_size,
    c.target_score
  )
  returning id into mid;

  update challenges set status = 'completed' where id = cid;
  return mid;
end $$;
