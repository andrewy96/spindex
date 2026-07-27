-- BEYLIVE team IDs for partner/team-battle tournaments.
-- Partner tournaments now score teams (T01, T02, ...) while individual
-- tournament formats keep the existing player scoring model.

create table if not exists public.beylive_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_no int not null check (team_no >= 1),
  team_code text not null,
  name text not null,
  seed int,
  created_at timestamptz not null default now(),
  unique (tournament_id, id),
  unique (tournament_id, team_no),
  unique (tournament_id, team_code)
);

create table if not exists public.beylive_team_members (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_id uuid not null references public.beylive_teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot_no int not null check (slot_no >= 1),
  created_at timestamptz not null default now(),
  primary key (tournament_id, user_id),
  unique (team_id, user_id),
  unique (team_id, slot_no),
  foreign key (tournament_id, team_id)
    references public.beylive_teams (tournament_id, id)
    on delete cascade
);

alter table public.beylive_matches
  add column if not exists winner_team_id uuid references public.beylive_teams (id);

alter table public.beylive_match_players
  add column if not exists team_id uuid references public.beylive_teams (id);

alter table public.beylive_match_rounds
  add column if not exists team_id uuid references public.beylive_teams (id);

alter table public.tournaments
  add column if not exists winner_team_id uuid references public.beylive_teams (id);

alter table public.beylive_teams enable row level security;
alter table public.beylive_team_members enable row level security;

drop policy if exists "beylive teams are public" on public.beylive_teams;
create policy "beylive teams are public" on public.beylive_teams
  for select using (true);

drop policy if exists "beylive team members are public" on public.beylive_team_members;
create policy "beylive team members are public" on public.beylive_team_members
  for select using (true);

grant select on public.beylive_teams, public.beylive_team_members to anon, authenticated;
grant update (winner_team_id) on public.tournaments to authenticated;

create or replace function public.ensure_beylive_partner_teams(tid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
  n int;
  i int := 1;
  team_no int := 1;
  group_count int;
  slot_no int;
  v_team_id uuid;
begin
  if exists (select 1 from public.beylive_teams where tournament_id = tid) then
    return;
  end if;

  select array_agg(tp.user_id order by coalesce(tp.seed, 999999), tp.created_at)
  into ids
  from public.tournament_players tp
  where tp.tournament_id = tid and tp.status = 'joined';

  n := coalesce(array_length(ids, 1), 0);
  if n < 2 then raise exception 'not_enough_players'; end if;

  while i <= n loop
    if n - i + 1 = 1 and team_no > 1 then
      select id into v_team_id
      from public.beylive_teams
      where tournament_id = tid
      order by team_no desc
      limit 1;

      select coalesce(max(slot_no), 0) + 1 into slot_no
      from public.beylive_team_members
      where team_id = v_team_id;

      insert into public.beylive_team_members (tournament_id, team_id, user_id, slot_no)
      values (tid, v_team_id, ids[i], slot_no);

      i := i + 1;
    else
      group_count := least(2, n - i + 1);

      insert into public.beylive_teams (tournament_id, team_no, team_code, name, seed)
      values (
        tid,
        team_no,
        'T' || lpad(team_no::text, 2, '0'),
        'Team ' || lpad(team_no::text, 2, '0'),
        team_no
      )
      returning id into v_team_id;

      for slot_no in 1..group_count loop
        insert into public.beylive_team_members (tournament_id, team_id, user_id, slot_no)
        values (tid, v_team_id, ids[i + slot_no - 1], slot_no);
      end loop;

      i := i + group_count;
      team_no := team_no + 1;
    end if;
  end loop;

  if (select count(*) from public.beylive_teams where tournament_id = tid) < 2 then
    raise exception 'not_enough_teams';
  end if;
end $$;

create or replace function public.create_beylive_team_match(
  p_tournament_id uuid,
  p_round_no int,
  p_bracket text,
  p_match_no int,
  p_table_no int,
  p_target_score int,
  p_teams uuid[]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
  v_team_id uuid;
  captain_id uuid;
  slot int := 1;
  team_count int := coalesce(array_length(p_teams, 1), 0);
begin
  if team_count = 0 then
    raise exception 'no_teams';
  end if;

  insert into public.beylive_matches (
    tournament_id,
    round_no,
    bracket,
    match_no,
    table_no,
    target_score,
    status,
    winner_id,
    winner_team_id,
    completed_at
  )
  values (
    p_tournament_id,
    p_round_no,
    p_bracket,
    p_match_no,
    p_table_no,
    p_target_score,
    case when team_count = 1 then 'completed' else 'scheduled' end,
    null,
    case when team_count = 1 then p_teams[1] else null end,
    case when team_count = 1 then now() else null end
  )
  returning id into mid;

  foreach v_team_id in array p_teams loop
    select btm.user_id into captain_id
    from public.beylive_team_members btm
    where btm.tournament_id = p_tournament_id
      and btm.team_id = v_team_id
    order by btm.slot_no
    limit 1;

    if captain_id is null then
      raise exception 'team_has_no_members';
    end if;

    insert into public.beylive_match_players (match_id, user_id, team_id, slot_no, result)
    values (
      mid,
      captain_id,
      v_team_id,
      slot,
      case when team_count = 1 then 'win' else 'pending' end
    );
    slot := slot + 1;
  end loop;

  if team_count = 1 then
    update public.beylive_matches
    set winner_id = captain_id
    where id = mid;
  end if;

  return mid;
end $$;

create or replace function public.start_beylive(tid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tournaments;
  ids uuid[];
  team_ids uuid[];
  n int;
  i int;
  j int;
  match_no int := 1;
  group_size int;
  effective_target int;
  players uuid[];
begin
  if auth.uid() is null then raise exception 'login_required'; end if;

  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if not public.can_manage_beylive(tid, auth.uid()) then raise exception 'not_allowed'; end if;
  if t.live_enabled or t.status = 'started' or exists (select 1 from public.beylive_matches where tournament_id = tid) then
    raise exception 'beylive_already_started';
  end if;

  select array_agg(tp.user_id order by coalesce(tp.seed, 999999), tp.created_at)
  into ids
  from public.tournament_players tp
  where tp.tournament_id = tid and tp.status = 'joined';

  n := coalesce(array_length(ids, 1), 0);
  if n < 2 then raise exception 'not_enough_players'; end if;

  effective_target := case when t.format = 'partner' and t.target_score = 4 then 7 else t.target_score end;

  update public.profiles p
  set player_code = 'SPX-' || lpad(nextval('public.profile_player_code_seq')::text, 4, '0')
  from public.tournament_players tp
  where tp.tournament_id = tid
    and tp.user_id = p.id
    and p.player_code is null;

  insert into public.beylive_judges (tournament_id, user_id, role)
  values (tid, t.host, 'host')
  on conflict (tournament_id, user_id) do update set role = excluded.role;

  update public.tournaments
  set live_enabled = true,
      status = 'started',
      current_round = 1,
      target_score = effective_target,
      winner_id = null,
      winner_team_id = null
  where id = tid;

  if t.format = 'leaderboard' then
    return;
  end if;

  if t.format = 'partner' then
    perform public.ensure_beylive_partner_teams(tid);

    select array_agg(bt.id order by coalesce(bt.seed, bt.team_no), bt.team_no)
    into team_ids
    from public.beylive_teams bt
    where bt.tournament_id = tid;

    n := coalesce(array_length(team_ids, 1), 0);
    if n < 2 then raise exception 'not_enough_teams'; end if;

    i := 1;
    while i <= n loop
      if i = n then
        perform public.create_beylive_team_match(tid, 1, 'main', match_no, match_no, effective_target, array[team_ids[i]]);
      else
        perform public.create_beylive_team_match(tid, 1, 'main', match_no, match_no, effective_target, array[team_ids[i], team_ids[i + 1]]);
      end if;
      match_no := match_no + 1;
      i := i + 2;
    end loop;
    return;
  end if;

  if t.format = 'round_robin' then
    for i in 1..(n - 1) loop
      for j in (i + 1)..n loop
        perform public.create_beylive_match(
          tid,
          1,
          'main',
          match_no,
          match_no,
          effective_target,
          array[ids[i], ids[j]]
        );
        match_no := match_no + 1;
      end loop;
    end loop;
    return;
  end if;

  if t.format = 'free_for_all' then
    i := 1;
    while i <= n loop
      group_size := least(4, n - i + 1);
      if n - i + 1 - group_size = 1 then
        group_size := group_size - 1;
      end if;
      players := ids[i:i + group_size - 1];
      perform public.create_beylive_match(tid, 1, 'main', match_no, match_no, effective_target, players);
      match_no := match_no + 1;
      i := i + group_size;
    end loop;
    return;
  end if;

  i := 1;
  while i <= n loop
    if i = n then
      players := array[ids[i]];
    else
      players := array[ids[i], ids[i + 1]];
    end if;
    perform public.create_beylive_match(tid, 1, 'main', match_no, match_no, effective_target, players);
    match_no := match_no + 1;
    i := i + 2;
  end loop;
end $$;

create or replace function public.record_beylive_team_point(mid uuid, p_team_id uuid, finish text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.beylive_matches;
  participant public.beylive_match_players;
  pts int;
  new_score int;
  top_score int;
  tied_top int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into m from public.beylive_matches where id = mid for update;
  if m is null then raise exception 'match_not_found'; end if;
  if not public.can_manage_beylive(m.tournament_id, auth.uid()) then raise exception 'not_allowed'; end if;
  if m.status = 'completed' then raise exception 'match_completed'; end if;
  if finish not in ('spin', 'over', 'burst', 'xtreme') then raise exception 'invalid_finish'; end if;

  pts := case
    when finish = 'spin' then 1
    when finish in ('over', 'burst') then 2
    else 3
  end;

  select * into participant
  from public.beylive_match_players
  where match_id = mid and team_id = p_team_id
  for update;
  if participant is null then raise exception 'team_not_in_match'; end if;

  insert into public.beylive_match_rounds (match_id, user_id, team_id, finish, pts, created_by)
  values (mid, participant.user_id, p_team_id, finish, pts, auth.uid());

  update public.beylive_match_players
  set score = score + pts
  where match_id = mid and team_id = p_team_id
  returning score into new_score;

  if m.status = 'scheduled' then
    update public.beylive_matches
    set status = 'live', started_at = coalesce(started_at, now())
    where id = mid;
  end if;

  select max(score) into top_score
  from public.beylive_match_players
  where match_id = mid;

  select count(*) into tied_top
  from public.beylive_match_players
  where match_id = mid and score = top_score;

  if new_score >= m.target_score and tied_top = 1 then
    update public.beylive_match_players
    set result = case when team_id = p_team_id then 'win' else 'loss' end
    where match_id = mid;

    update public.beylive_matches
    set status = 'completed',
        winner_id = participant.user_id,
        winner_team_id = p_team_id,
        completed_at = now()
    where id = mid;
  end if;
end $$;

create or replace function public.undo_beylive_point(mid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.beylive_matches;
  r public.beylive_match_rounds;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into m from public.beylive_matches where id = mid for update;
  if m is null then raise exception 'match_not_found'; end if;
  if not public.can_manage_beylive(m.tournament_id, auth.uid()) then raise exception 'not_allowed'; end if;

  select * into r
  from public.beylive_match_rounds
  where match_id = mid
  order by created_at desc, id desc
  limit 1;
  if r is null then return; end if;

  delete from public.beylive_match_rounds where id = r.id;

  update public.beylive_match_players
  set score = greatest(0, score - r.pts),
      result = 'pending'
  where match_id = mid
    and (
      (r.team_id is not null and team_id = r.team_id)
      or (r.team_id is null and user_id = r.user_id)
    );

  update public.beylive_match_players
  set result = 'pending'
  where match_id = mid;

  update public.beylive_matches
  set status = case when exists (select 1 from public.beylive_match_rounds where match_id = mid) then 'live' else 'scheduled' end,
      winner_id = null,
      winner_team_id = null,
      completed_at = null
  where id = mid;
end $$;

create or replace function public.complete_beylive_match(mid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.beylive_matches;
  winner_user uuid;
  winner_team uuid;
  top_score int;
  tied_top int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into m from public.beylive_matches where id = mid for update;
  if m is null then raise exception 'match_not_found'; end if;
  if not public.can_manage_beylive(m.tournament_id, auth.uid()) then raise exception 'not_allowed'; end if;

  select max(score) into top_score
  from public.beylive_match_players
  where match_id = mid;
  if coalesce(top_score, 0) < m.target_score then raise exception 'winner_below_target'; end if;

  select count(*) into tied_top
  from public.beylive_match_players
  where match_id = mid and score = top_score;
  if tied_top <> 1 then raise exception 'score_tie'; end if;

  select user_id, team_id into winner_user, winner_team
  from public.beylive_match_players
  where match_id = mid
  order by score desc, slot_no asc
  limit 1;

  update public.beylive_match_players
  set result = case
    when winner_team is not null and team_id = winner_team then 'win'
    when winner_team is null and user_id = winner_user then 'win'
    else 'loss'
  end
  where match_id = mid;

  update public.beylive_matches
  set status = 'completed',
      winner_id = winner_user,
      winner_team_id = winner_team,
      completed_at = now()
  where id = mid;
end $$;

create or replace function public.advance_beylive_round(tid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tournaments;
  cur int;
  next_round int;
  ids uuid[];
  team_ids uuid[];
  loser_ids uuid[];
  loser_winners uuid[];
  pool uuid[];
  n int;
  pool_count int;
  main_count int;
  round_limit int;
  i int;
  match_no int := 1;
  group_size int;
  players uuid[];
  champion_id uuid;
  champion_team_id uuid;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if not public.can_manage_beylive(tid, auth.uid()) then raise exception 'not_allowed'; end if;
  if t.status = 'completed' then return; end if;

  cur := coalesce(t.current_round, 1);
  if exists (
    select 1 from public.beylive_matches
    where tournament_id = tid
      and round_no = cur
      and status not in ('completed', 'cancelled')
  ) then
    raise exception 'round_not_complete';
  end if;

  if t.format = 'partner' then
    if exists (
      select 1 from public.beylive_matches
      where tournament_id = tid and round_no = cur and bracket = 'grand' and status = 'completed'
    ) then
      select winner_team_id into champion_team_id
      from public.beylive_matches
      where tournament_id = tid and round_no = cur and bracket = 'grand' and status = 'completed'
      order by match_no desc
      limit 1;

      select user_id into champion_id
      from public.beylive_team_members
      where team_id = champion_team_id
      order by slot_no
      limit 1;

      update public.tournaments
      set status = 'completed',
          live_enabled = false,
          winner_id = champion_id,
          winner_team_id = champion_team_id
      where id = tid;
      return;
    end if;

    select count(*) into n
    from public.beylive_teams
    where tournament_id = tid;
    round_limit := ceiling(ln(greatest(2, n)) / ln(2));

    select array_agg(team_id order by wins desc, diff desc, points desc, losses asc, seed nulls last, team_no)
    into team_ids
    from (
      select
        bt.id as team_id,
        bt.seed,
        bt.team_no,
        coalesce(sum(case when bm.status = 'completed' and bmp.result = 'win' then 1 else 0 end), 0) as wins,
        coalesce(sum(case when bm.status = 'completed' and bmp.result = 'loss' then 1 else 0 end), 0) as losses,
        coalesce(sum(case when bm.status = 'completed' then bmp.score else 0 end), 0) as points,
        coalesce(sum(case when bm.status = 'completed' then mt.total_score - bmp.score else 0 end), 0) as against,
        coalesce(sum(case when bm.status = 'completed' then bmp.score else 0 end), 0)
          - coalesce(sum(case when bm.status = 'completed' then mt.total_score - bmp.score else 0 end), 0) as diff
      from public.beylive_teams bt
      left join public.beylive_match_players bmp on bmp.team_id = bt.id
      left join public.beylive_matches bm on bm.id = bmp.match_id and bm.tournament_id = tid
      left join lateral (
        select coalesce(sum(x.score), 0) as total_score
        from public.beylive_match_players x
        where x.match_id = bm.id
      ) mt on true
      where bt.tournament_id = tid
      group by bt.id, bt.seed, bt.team_no
    ) ranked;

    n := coalesce(array_length(team_ids, 1), 0);
    if n <= 1 then
      champion_team_id := case when n = 1 then team_ids[1] else t.winner_team_id end;
      select user_id into champion_id
      from public.beylive_team_members
      where team_id = champion_team_id
      order by slot_no
      limit 1;

      update public.tournaments
      set status = 'completed',
          live_enabled = false,
          winner_id = champion_id,
          winner_team_id = champion_team_id
      where id = tid;
      return;
    end if;

    next_round := cur + 1;

    if cur >= round_limit then
      perform public.create_beylive_team_match(
        tid,
        next_round,
        'grand',
        1,
        1,
        t.target_score,
        array[team_ids[1], team_ids[2]]
      );
      update public.tournaments set current_round = next_round where id = tid;
      return;
    end if;

    i := 1;
    while i <= n loop
      if i = n then
        perform public.create_beylive_team_match(tid, next_round, 'main', match_no, match_no, t.target_score, array[team_ids[i]]);
      else
        perform public.create_beylive_team_match(tid, next_round, 'main', match_no, match_no, t.target_score, array[team_ids[i], team_ids[i + 1]]);
      end if;
      match_no := match_no + 1;
      i := i + 2;
    end loop;

    update public.tournaments set current_round = next_round where id = tid;
    return;
  end if;

  if t.format in ('round_robin', 'leaderboard') then
    select mp.user_id into champion_id
    from public.beylive_match_players mp
    join public.beylive_matches bm on bm.id = mp.match_id
    where bm.tournament_id = tid and bm.status = 'completed'
    group by mp.user_id
    order by
      sum(case when mp.result = 'win' then 1 else 0 end) desc,
      sum(mp.score) desc
    limit 1;

    update public.tournaments
    set status = 'completed',
        live_enabled = false,
        winner_id = champion_id,
        winner_team_id = null
    where id = tid;
    return;
  end if;

  if t.format = 'double_elimination' then
    if exists (
      select 1 from public.beylive_matches
      where tournament_id = tid and round_no = cur and bracket = 'grand' and status = 'completed'
    ) then
      select winner_id into champion_id
      from public.beylive_matches
      where tournament_id = tid and round_no = cur and bracket = 'grand' and status = 'completed'
      order by match_no desc
      limit 1;

      update public.tournaments
      set status = 'completed',
          live_enabled = false,
          winner_id = champion_id,
          winner_team_id = null
      where id = tid;
      return;
    end if;

    select array_agg(winner_id order by match_no)
    into ids
    from public.beylive_matches
    where tournament_id = tid
      and round_no = cur
      and bracket = 'main'
      and status = 'completed'
      and winner_id is not null;

    select array_agg(mp.user_id order by bm.match_no, mp.slot_no)
    into loser_ids
    from public.beylive_matches bm
    join public.beylive_match_players mp on mp.match_id = bm.id
    where bm.tournament_id = tid
      and bm.round_no = cur
      and bm.bracket = 'main'
      and bm.status = 'completed'
      and bm.winner_id is not null
      and mp.user_id <> bm.winner_id
      and (
        select count(*) from public.beylive_match_players x where x.match_id = bm.id
      ) = 2;

    select array_agg(winner_id order by match_no)
    into loser_winners
    from public.beylive_matches
    where tournament_id = tid
      and round_no = cur
      and bracket = 'losers'
      and status = 'completed'
      and winner_id is not null;

    pool := coalesce(loser_ids, '{}'::uuid[]) || coalesce(loser_winners, '{}'::uuid[]);
    main_count := coalesce(array_length(ids, 1), 0);
    pool_count := coalesce(array_length(pool, 1), 0);

    if main_count = 0 and pool_count <= 1 then
      update public.tournaments
      set status = 'completed',
          live_enabled = false,
          winner_id = case when pool_count = 1 then pool[1] else winner_id end,
          winner_team_id = null
      where id = tid;
      return;
    end if;

    next_round := cur + 1;

    if main_count > 1 then
      i := 1;
      while i <= main_count loop
        if i = main_count then
          players := array[ids[i]];
        else
          players := array[ids[i], ids[i + 1]];
        end if;
        perform public.create_beylive_match(tid, next_round, 'main', match_no, match_no, t.target_score, players);
        match_no := match_no + 1;
        i := i + 2;
      end loop;

      i := 1;
      while i <= pool_count loop
        if i = pool_count then
          players := array[pool[i]];
        else
          players := array[pool[i], pool[i + 1]];
        end if;
        perform public.create_beylive_match(tid, next_round, 'losers', match_no, match_no, t.target_score, players);
        match_no := match_no + 1;
        i := i + 2;
      end loop;
    elsif main_count = 1 and pool_count > 1 then
      i := 1;
      while i <= pool_count loop
        if i = pool_count then
          players := array[pool[i]];
        else
          players := array[pool[i], pool[i + 1]];
        end if;
        perform public.create_beylive_match(tid, next_round, 'losers', match_no, match_no, t.target_score, players);
        match_no := match_no + 1;
        i := i + 2;
      end loop;
    elsif main_count = 1 and pool_count = 1 then
      perform public.create_beylive_match(tid, next_round, 'grand', 1, 1, t.target_score, array[ids[1], pool[1]]);
    else
      update public.tournaments
      set status = 'completed',
          live_enabled = false,
          winner_id = ids[1],
          winner_team_id = null
      where id = tid;
      return;
    end if;

    update public.tournaments set current_round = next_round where id = tid;
    return;
  end if;

  if t.format = 'swiss' then
    select count(*) into n
    from public.tournament_players
    where tournament_id = tid and status = 'joined';
    round_limit := ceiling(ln(greatest(2, n)) / ln(2));

    if cur >= round_limit then
      select mp.user_id into champion_id
      from public.beylive_match_players mp
      join public.beylive_matches bm on bm.id = mp.match_id
      where bm.tournament_id = tid and bm.status = 'completed'
      group by mp.user_id
      order by
        sum(case when mp.result = 'win' then 1 else 0 end) desc,
        sum(mp.score) desc
      limit 1;

      update public.tournaments
      set status = 'completed',
          live_enabled = false,
          winner_id = champion_id,
          winner_team_id = null
      where id = tid;
      return;
    end if;

    select array_agg(user_id order by wins desc, points desc, seed nulls last, user_id)
    into ids
    from (
      select
        tp.user_id,
        tp.seed,
        coalesce(sum(case when mp.result = 'win' then 1 else 0 end), 0) as wins,
        coalesce(sum(mp.score), 0) as points
      from public.tournament_players tp
      left join public.beylive_matches bm on bm.tournament_id = tid
      left join public.beylive_match_players mp on mp.match_id = bm.id and mp.user_id = tp.user_id
      where tp.tournament_id = tid and tp.status = 'joined'
      group by tp.user_id, tp.seed
    ) ranked;
  else
    select array_agg(winner_id order by match_no)
    into ids
    from public.beylive_matches
    where tournament_id = tid
      and round_no = cur
      and status = 'completed'
      and winner_id is not null;
  end if;

  n := coalesce(array_length(ids, 1), 0);
  if n <= 1 then
    update public.tournaments
    set status = 'completed',
        live_enabled = false,
        winner_id = case when n = 1 then ids[1] else winner_id end,
        winner_team_id = null
    where id = tid;
    return;
  end if;

  next_round := cur + 1;

  if t.format = 'free_for_all' then
    i := 1;
    while i <= n loop
      group_size := least(4, n - i + 1);
      if n - i + 1 - group_size = 1 then
        group_size := group_size - 1;
      end if;
      players := ids[i:i + group_size - 1];
      perform public.create_beylive_match(tid, next_round, 'main', match_no, match_no, t.target_score, players);
      match_no := match_no + 1;
      i := i + group_size;
    end loop;
  else
    i := 1;
    while i <= n loop
      if i = n then
        players := array[ids[i]];
      else
        players := array[ids[i], ids[i + 1]];
      end if;
      perform public.create_beylive_match(
        tid,
        next_round,
        'main',
        match_no,
        match_no,
        t.target_score,
        players
      );
      match_no := match_no + 1;
      i := i + 2;
    end loop;
  end if;

  update public.tournaments set current_round = next_round where id = tid;
end $$;

revoke execute on function public.ensure_beylive_partner_teams(uuid) from public;
revoke execute on function public.create_beylive_team_match(uuid, int, text, int, int, int, uuid[]) from public;
revoke execute on function public.record_beylive_team_point(uuid, uuid, text) from public;

grant execute on function public.record_beylive_team_point(uuid, uuid, text) to authenticated;

create index if not exists beylive_teams_tournament_idx
  on public.beylive_teams (tournament_id, team_no);

create index if not exists beylive_team_members_team_idx
  on public.beylive_team_members (team_id, slot_no);

create index if not exists beylive_match_players_team_idx
  on public.beylive_match_players (team_id);

create index if not exists beylive_matches_winner_team_idx
  on public.beylive_matches (winner_team_id);
