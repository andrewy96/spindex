-- BEYLIVE: live tournament matches, player IDs, scoring, and judge control.

create sequence if not exists public.profile_player_code_seq;

alter table public.profiles
  add column if not exists player_code text unique;

update public.profiles
set player_code = 'SPX-' || lpad(nextval('public.profile_player_code_seq')::text, 4, '0')
where player_code is null;

create or replace function public.set_profile_player_code()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.player_code is null then
    new.player_code := 'SPX-' || lpad(nextval('public.profile_player_code_seq')::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists profiles_player_code_before_insert on public.profiles;
create trigger profiles_player_code_before_insert
  before insert on public.profiles
  for each row execute function public.set_profile_player_code();

alter table public.tournaments
  add column if not exists live_enabled boolean not null default false,
  add column if not exists current_round int,
  add column if not exists target_score int not null default 4 check (target_score between 1 and 30),
  add column if not exists winner_id uuid references public.profiles (id);

create table if not exists public.beylive_judges (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'judge' check (role in ('host', 'judge', 'scorer')),
  created_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

create table if not exists public.beylive_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round_no int not null check (round_no >= 1),
  bracket text not null default 'main' check (bracket in ('main', 'losers', 'grand', 'leaderboard')),
  match_no int not null check (match_no >= 1),
  table_no int check (table_no is null or table_no >= 1),
  target_score int not null default 4 check (target_score between 1 and 30),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'completed', 'cancelled', 'bye')),
  winner_id uuid references public.profiles (id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tournament_id, round_no, bracket, match_no)
);

create table if not exists public.beylive_match_players (
  match_id uuid not null references public.beylive_matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot_no int not null check (slot_no >= 1),
  score int not null default 0 check (score >= 0),
  result text not null default 'pending' check (result in ('pending', 'win', 'loss')),
  placement int check (placement is null or placement >= 1),
  primary key (match_id, user_id),
  unique (match_id, slot_no)
);

create table if not exists public.beylive_match_rounds (
  id bigserial primary key,
  match_id uuid not null references public.beylive_matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  finish text not null check (finish in ('spin', 'over', 'burst', 'xtreme')),
  pts int not null check (pts in (1, 2, 3)),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.beylive_judges enable row level security;
alter table public.beylive_matches enable row level security;
alter table public.beylive_match_players enable row level security;
alter table public.beylive_match_rounds enable row level security;

drop policy if exists "beylive judges are public" on public.beylive_judges;
create policy "beylive judges are public" on public.beylive_judges
  for select using (true);

drop policy if exists "beylive matches are public" on public.beylive_matches;
create policy "beylive matches are public" on public.beylive_matches
  for select using (true);

drop policy if exists "beylive match players are public" on public.beylive_match_players;
create policy "beylive match players are public" on public.beylive_match_players
  for select using (true);

drop policy if exists "beylive rounds are public" on public.beylive_match_rounds;
create policy "beylive rounds are public" on public.beylive_match_rounds
  for select using (true);

grant select on public.beylive_judges, public.beylive_matches, public.beylive_match_players, public.beylive_match_rounds
  to anon, authenticated;

grant update (live_enabled, current_round, target_score, winner_id, status) on public.tournaments
  to authenticated;

create or replace function public.can_manage_beylive(tid uuid, uid uuid)
returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = tid and t.host = uid
  ) or exists (
    select 1 from public.beylive_judges j
    where j.tournament_id = tid and j.user_id = uid
  );
$$;

create or replace function public.create_beylive_match(
  p_tournament_id uuid,
  p_round_no int,
  p_bracket text,
  p_match_no int,
  p_table_no int,
  p_target_score int,
  p_players uuid[]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
  player_id uuid;
  slot int := 1;
  player_count int := coalesce(array_length(p_players, 1), 0);
begin
  if player_count = 0 then
    raise exception 'no_players';
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
    completed_at
  )
  values (
    p_tournament_id,
    p_round_no,
    p_bracket,
    p_match_no,
    p_table_no,
    p_target_score,
    case when player_count = 1 then 'completed' else 'scheduled' end,
    case when player_count = 1 then p_players[1] else null end,
    case when player_count = 1 then now() else null end
  )
  returning id into mid;

  foreach player_id in array p_players loop
    insert into public.beylive_match_players (match_id, user_id, slot_no, result)
    values (
      mid,
      player_id,
      slot,
      case when player_count = 1 then 'win' else 'pending' end
    );
    slot := slot + 1;
  end loop;

  return mid;
end $$;

create or replace function public.start_beylive(tid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tournaments;
  ids uuid[];
  n int;
  i int;
  j int;
  match_no int := 1;
  group_size int;
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
      winner_id = null
  where id = tid;

  if t.format = 'leaderboard' then
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
          t.target_score,
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
      perform public.create_beylive_match(tid, 1, 'main', match_no, match_no, t.target_score, players);
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
    perform public.create_beylive_match(tid, 1, 'main', match_no, match_no, t.target_score, players);
    match_no := match_no + 1;
    i := i + 2;
  end loop;
end $$;

create or replace function public.start_beylive_match(mid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.beylive_matches;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into m from public.beylive_matches where id = mid for update;
  if m is null then raise exception 'match_not_found'; end if;
  if not public.can_manage_beylive(m.tournament_id, auth.uid()) then raise exception 'not_allowed'; end if;
  if m.status <> 'scheduled' then return; end if;

  update public.beylive_matches
  set status = 'live', started_at = coalesce(started_at, now())
  where id = mid;
end $$;

create or replace function public.record_beylive_point(mid uuid, player_id uuid, finish text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.beylive_matches;
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

  perform 1 from public.beylive_match_players
  where match_id = mid and user_id = player_id
  for update;
  if not found then raise exception 'player_not_in_match'; end if;

  insert into public.beylive_match_rounds (match_id, user_id, finish, pts, created_by)
  values (mid, player_id, finish, pts, auth.uid());

  update public.beylive_match_players
  set score = score + pts
  where match_id = mid and user_id = player_id
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
    set result = case when user_id = player_id then 'win' else 'loss' end
    where match_id = mid;

    update public.beylive_matches
    set status = 'completed',
        winner_id = player_id,
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
  where match_id = mid and user_id = r.user_id;

  update public.beylive_match_players
  set result = 'pending'
  where match_id = mid;

  update public.beylive_matches
  set status = case when exists (select 1 from public.beylive_match_rounds where match_id = mid) then 'live' else 'scheduled' end,
      winner_id = null,
      completed_at = null
  where id = mid;
end $$;

create or replace function public.complete_beylive_match(mid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.beylive_matches;
  winner uuid;
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

  select user_id into winner
  from public.beylive_match_players
  where match_id = mid
  order by score desc, slot_no asc
  limit 1;

  update public.beylive_match_players
  set result = case when user_id = winner then 'win' else 'loss' end
  where match_id = mid;

  update public.beylive_matches
  set status = 'completed',
      winner_id = winner,
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
        winner_id = champion_id
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
          winner_id = champion_id
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
          winner_id = case when pool_count = 1 then pool[1] else winner_id end
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
          winner_id = ids[1]
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
          winner_id = champion_id
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
        winner_id = case when n = 1 then ids[1] else winner_id end
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

revoke execute on function public.can_manage_beylive(uuid, uuid) from public;
revoke execute on function public.create_beylive_match(uuid, int, text, int, int, int, uuid[]) from public;
revoke execute on function public.start_beylive(uuid) from public;
revoke execute on function public.start_beylive_match(uuid) from public;
revoke execute on function public.record_beylive_point(uuid, uuid, text) from public;
revoke execute on function public.undo_beylive_point(uuid) from public;
revoke execute on function public.complete_beylive_match(uuid) from public;
revoke execute on function public.advance_beylive_round(uuid) from public;

grant execute on function public.start_beylive(uuid) to authenticated;
grant execute on function public.start_beylive_match(uuid) to authenticated;
grant execute on function public.record_beylive_point(uuid, uuid, text) to authenticated;
grant execute on function public.undo_beylive_point(uuid) to authenticated;
grant execute on function public.complete_beylive_match(uuid) to authenticated;
grant execute on function public.advance_beylive_round(uuid) to authenticated;

create index if not exists beylive_matches_tournament_round_idx
  on public.beylive_matches (tournament_id, round_no, match_no);
create index if not exists beylive_match_players_user_idx
  on public.beylive_match_players (user_id);
create index if not exists beylive_rounds_match_idx
  on public.beylive_match_rounds (match_id, created_at desc);

do $$
begin
  alter publication supabase_realtime add table public.beylive_matches;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.beylive_match_players;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.beylive_match_rounds;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
