-- Make Swiss BEYLIVE honor configured rounds, optional pools, top cut, and
-- 1st-4th placement through a final plus 3rd-place match.

create or replace function public.beylive_swiss_pool_count(
  p_player_cap int,
  p_joined_count int,
  p_format_config jsonb
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  event_size int := greatest(2, least(256, greatest(coalesce(p_player_cap, 16), coalesce(p_joined_count, 0))));
  default_groups int := case when event_size >= 32 then least(8, greatest(2, ceiling(event_size::numeric / 16)::int)) else 1 end;
  max_groups int := least(8, greatest(1, floor(event_size::numeric / 2)::int));
  configured_groups int;
  stages jsonb;
begin
  stages := case
    when jsonb_typeof(coalesce(p_format_config, '{}'::jsonb)->'stages') = 'array'
      then coalesce(p_format_config, '{}'::jsonb)->'stages'
    else '[]'::jsonb
  end;

  select (stage->>'groups')::int
  into configured_groups
  from jsonb_array_elements(stages) with ordinality as items(stage, ordinality)
  where (stage->>'type' = 'swiss' or stage->>'id' = 'swiss')
    and coalesce(stage->>'groups', '') ~ '^[0-9]+$'
  order by ordinality
  limit 1;

  return least(max_groups, greatest(1, coalesce(configured_groups, default_groups)));
end;
$$;

create or replace function public.beylive_swiss_round_limit(
  p_player_count int,
  p_pool_count int,
  p_format_config jsonb
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  player_count int := greatest(2, least(256, coalesce(p_player_count, 16)));
  pool_count int := greatest(1, least(8, coalesce(p_pool_count, 1)));
  default_rounds int := greatest(1, ceiling(ln(greatest(2, ceiling(player_count::numeric / pool_count))) / ln(2))::int);
  configured_rounds int;
  stages jsonb;
begin
  stages := case
    when jsonb_typeof(coalesce(p_format_config, '{}'::jsonb)->'stages') = 'array'
      then coalesce(p_format_config, '{}'::jsonb)->'stages'
    else '[]'::jsonb
  end;

  select (stage->>'rounds')::int
  into configured_rounds
  from jsonb_array_elements(stages) with ordinality as items(stage, ordinality)
  where (stage->>'type' = 'swiss' or stage->>'id' = 'swiss')
    and coalesce(stage->>'rounds', '') ~ '^[0-9]+$'
  order by ordinality
  limit 1;

  return greatest(1, least(16, coalesce(configured_rounds, default_rounds)));
end;
$$;

create or replace function public.beylive_swiss_advance_count(
  p_player_count int,
  p_pool_count int,
  p_format_config jsonb
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  player_count int := greatest(2, least(256, coalesce(p_player_count, 16)));
  default_cut int := case
    when player_count >= 32 then 16
    when player_count >= 16 then 8
    when player_count >= 8 then 4
    else 2
  end;
  configured_cut int;
  stages jsonb;
begin
  stages := case
    when jsonb_typeof(coalesce(p_format_config, '{}'::jsonb)->'stages') = 'array'
      then coalesce(p_format_config, '{}'::jsonb)->'stages'
    else '[]'::jsonb
  end;

  select (stage->>'advanceCount')::int
  into configured_cut
  from jsonb_array_elements(stages) with ordinality as items(stage, ordinality)
  where (stage->>'type' = 'swiss' or stage->>'id' = 'swiss')
    and coalesce(stage->>'advanceCount', '') ~ '^[0-9]+$'
  order by ordinality
  limit 1;

  return least(player_count, greatest(2, coalesce(configured_cut, default_cut)));
end;
$$;

create or replace function public.beylive_swiss_stage_target_score(
  p_format_config jsonb,
  p_stage_type text,
  p_fallback int
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  configured_score int;
  stages jsonb;
begin
  stages := case
    when jsonb_typeof(coalesce(p_format_config, '{}'::jsonb)->'stages') = 'array'
      then coalesce(p_format_config, '{}'::jsonb)->'stages'
    else '[]'::jsonb
  end;

  select (stage->>'targetScore')::int
  into configured_score
  from jsonb_array_elements(stages) with ordinality as items(stage, ordinality)
  where (stage->>'type' = p_stage_type or stage->>'id' = p_stage_type)
    and coalesce(stage->>'targetScore', '') ~ '^[0-9]+$'
  order by ordinality
  limit 1;

  return greatest(1, least(30, coalesce(configured_score, p_fallback, 4)));
end;
$$;

create or replace function public.create_beylive_swiss_pool_round(
  tid uuid,
  p_pool_no int,
  p_round_no int,
  p_target_score int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a_rec record;
  b_id uuid;
  bye_id uuid;
  match_no int := 1;
  player_count int;
  half_count int;
  seeded_ids uuid[];
  i int;
  bracket_name text := 'pool_' || p_pool_no;
begin
  create temp table if not exists _swiss_pool_queue (
    user_id uuid primary key,
    seed int,
    wins int not null,
    losses int not null,
    points int not null,
    against int not null,
    diff int not null,
    bye_count int not null
  ) on commit drop;
  delete from _swiss_pool_queue where true;

  insert into _swiss_pool_queue (user_id, seed, wins, losses, points, against, diff, bye_count)
  select
    tp.user_id,
    tp.seed,
    coalesce(sum(case when bm.status = 'completed' and mp.result = 'win' then 1 else 0 end), 0)::int as wins,
    coalesce(sum(case when bm.status = 'completed' and mp.result = 'loss' then 1 else 0 end), 0)::int as losses,
    coalesce(sum(case when bm.status = 'completed' then mp.score else 0 end), 0)::int as points,
    coalesce(sum(case when bm.status = 'completed' then mt.total_score - mp.score else 0 end), 0)::int as against,
    (
      coalesce(sum(case when bm.status = 'completed' then mp.score else 0 end), 0)
        - coalesce(sum(case when bm.status = 'completed' then mt.total_score - mp.score else 0 end), 0)
    )::int as diff,
    coalesce(sum(case when bm.status = 'completed' and mt.player_count = 1 then 1 else 0 end), 0)::int as bye_count
  from public.tournament_players tp
  left join public.beylive_matches bm
    on bm.tournament_id = tid
    and bm.bracket = bracket_name
    and bm.status <> 'cancelled'
  left join public.beylive_match_players mp
    on mp.match_id = bm.id
    and mp.user_id = tp.user_id
  left join lateral (
    select count(*)::int as player_count, coalesce(sum(x.score), 0)::int as total_score
    from public.beylive_match_players x
    where x.match_id = bm.id
  ) mt on true
  where tp.tournament_id = tid
    and tp.status = 'joined'
    and tp.pool_no = p_pool_no
  group by tp.user_id, tp.seed;

  select count(*) into player_count from _swiss_pool_queue;
  if player_count < 2 then return; end if;

  select coalesce(max(bm.match_no), 0) + 1
  into match_no
  from public.beylive_matches bm
  where bm.tournament_id = tid
    and bm.round_no = p_round_no;

  if player_count % 2 = 1 then
    select user_id
    into bye_id
    from _swiss_pool_queue
    order by bye_count asc, wins asc, diff asc, points asc, losses desc, seed desc nulls last, user_id desc
    limit 1;

    delete from _swiss_pool_queue where user_id = bye_id;
    player_count := player_count - 1;
  end if;

  if p_round_no <= 1 then
    select array_agg(user_id order by seed nulls last, user_id)
    into seeded_ids
    from _swiss_pool_queue;

    half_count := player_count / 2;
    i := 1;
    while i <= half_count loop
      perform public.create_beylive_match(
        tid,
        p_round_no,
        bracket_name,
        match_no,
        match_no,
        p_target_score,
        array[seeded_ids[i], seeded_ids[i + half_count]]
      );
      match_no := match_no + 1;
      i := i + 1;
    end loop;
  else
    while exists (select 1 from _swiss_pool_queue) loop
      select *
      into a_rec
      from _swiss_pool_queue
      order by wins desc, diff desc, points desc, losses asc, seed nulls last, user_id
      limit 1;

      select q.user_id
      into b_id
      from _swiss_pool_queue q
      where q.user_id <> a_rec.user_id
      order by
        case when exists (
          select 1
          from public.beylive_matches bm
          join public.beylive_match_players a on a.match_id = bm.id and a.user_id = a_rec.user_id
          join public.beylive_match_players b on b.match_id = bm.id and b.user_id = q.user_id
          where bm.tournament_id = tid
            and bm.bracket = bracket_name
            and bm.status <> 'cancelled'
        ) then 1 else 0 end,
        abs(q.wins - a_rec.wins),
        q.wins desc,
        abs(q.diff - a_rec.diff),
        q.diff desc,
        q.points desc,
        q.losses asc,
        q.seed nulls last,
        q.user_id
      limit 1;

      perform public.create_beylive_match(
        tid,
        p_round_no,
        bracket_name,
        match_no,
        match_no,
        p_target_score,
        case when b_id is null then array[a_rec.user_id] else array[a_rec.user_id, b_id] end
      );

      if b_id is null then
        delete from _swiss_pool_queue where user_id = a_rec.user_id;
      else
        delete from _swiss_pool_queue where user_id in (a_rec.user_id, b_id);
      end if;

      match_no := match_no + 1;
      b_id := null;
    end loop;
  end if;

  if bye_id is not null then
    perform public.create_beylive_match(
      tid,
      p_round_no,
      bracket_name,
      match_no,
      match_no,
      p_target_score,
      array[bye_id]
    );
  end if;
end;
$$;

alter function public.start_beylive(uuid) rename to start_beylive_before_swiss_top_cut_20260824;
alter function public.advance_beylive_round(uuid) rename to advance_beylive_round_before_swiss_top_cut_20260824;

create or replace function public.start_beylive_swiss_top_cut(tid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  n int;
  pool_count int;
  effective_target int;
  pool_no_i int;
begin
  select * into t from public.tournaments where id = tid for update;

  if t is null or t.format <> 'swiss' then
    perform public.start_beylive_before_swiss_top_cut_20260824(tid);
    return;
  end if;

  if auth.uid() is null then raise exception 'login_required'; end if;
  if not public.can_manage_beylive(tid, auth.uid()) then raise exception 'not_allowed'; end if;
  if t.live_enabled or t.status = 'started' or exists (select 1 from public.beylive_matches where tournament_id = tid) then
    raise exception 'beylive_already_started';
  end if;

  select count(*) into n
  from public.tournament_players
  where tournament_id = tid
    and status = 'joined';

  if n < 2 then raise exception 'not_enough_players'; end if;

  pool_count := public.beylive_swiss_pool_count(t.max_players, n, t.format_config);
  if n < pool_count * 2 then raise exception 'not_enough_players_for_pools'; end if;

  effective_target := public.beylive_swiss_stage_target_score(t.format_config, 'swiss', t.target_score);

  update public.profiles pr
  set player_code = 'SPX-' || lpad(nextval('public.profile_player_code_seq')::text, 4, '0')
  from public.tournament_players tp
  where tp.tournament_id = tid
    and tp.user_id = pr.id
    and pr.player_code is null;

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

  update public.tournament_players
  set pool_no = null
  where tournament_id = tid
    and status = 'joined'
    and pool_no is not null
    and (pool_no < 1 or pool_no > pool_count);

  perform public.assign_group_stage_pools(tid, pool_count);

  for pool_no_i in 1..pool_count loop
    perform public.create_beylive_swiss_pool_round(tid, pool_no_i, 1, effective_target);
  end loop;
end;
$$;

create or replace function public.advance_beylive_swiss_top_cut(tid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  cur int;
  next_round int;
  ids uuid[];
  n int;
  player_count int;
  pool_count int;
  round_limit int;
  advance_count int;
  seed_slots int[];
  slot_idx int;
  slot_a int;
  slot_b int;
  next_match_no int := 1;
  pool_no_i int;
  champion_id uuid;
  knockout_target int;
  swiss_target int;
  current_main_count int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;

  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.format <> 'swiss' then
    perform public.advance_beylive_round_before_swiss_top_cut_20260824(tid);
    return;
  end if;
  if not public.can_manage_beylive(tid, auth.uid()) then raise exception 'not_allowed'; end if;
  if t.status = 'completed' then return; end if;

  cur := coalesce(t.current_round, 1);
  if exists (
    select 1
    from public.beylive_matches
    where tournament_id = tid
      and round_no = cur
      and status not in ('completed', 'cancelled')
  ) then
    raise exception 'round_not_complete';
  end if;

  if exists (select 1 from public.beylive_matches where tournament_id = tid and bracket = 'main') then
    select count(*) into current_main_count
    from public.beylive_matches
    where tournament_id = tid
      and round_no = cur
      and bracket = 'main';

    if current_main_count = 1 then
      select winner_id into champion_id
      from public.beylive_matches
      where tournament_id = tid
        and round_no = cur
        and bracket = 'main'
        and status = 'completed'
        and winner_id is not null
      order by match_no
      limit 1;

      if champion_id is not null then
        update public.tournaments
        set status = 'completed',
            live_enabled = false,
            winner_id = champion_id,
            winner_team_id = null
        where id = tid;
        return;
      end if;
    end if;

    select array_agg(winner_id order by match_no)
    into ids
    from public.beylive_matches
    where tournament_id = tid
      and round_no = cur
      and bracket = 'main'
      and status = 'completed'
      and winner_id is not null;

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
    if exists (select 1 from public.beylive_matches where tournament_id = tid and round_no = next_round) then
      update public.tournaments set current_round = next_round where id = tid;
      return;
    end if;

    knockout_target := public.beylive_swiss_stage_target_score(t.format_config, 'knockout', greatest(t.target_score, 7));
    slot_idx := 1;
    while slot_idx <= n loop
      if slot_idx = n then
        perform public.create_beylive_match(tid, next_round, 'main', next_match_no, next_match_no, knockout_target, array[ids[slot_idx]]);
      else
        perform public.create_beylive_match(tid, next_round, 'main', next_match_no, next_match_no, knockout_target, array[ids[slot_idx], ids[slot_idx + 1]]);
      end if;
      next_match_no := next_match_no + 1;
      slot_idx := slot_idx + 2;
    end loop;

    update public.tournaments set current_round = next_round where id = tid;
    return;
  end if;

  select count(*) into player_count
  from public.tournament_players
  where tournament_id = tid
    and status = 'joined';

  pool_count := public.beylive_swiss_pool_count(t.max_players, player_count, t.format_config);
  round_limit := public.beylive_swiss_round_limit(player_count, pool_count, t.format_config);
  swiss_target := public.beylive_swiss_stage_target_score(t.format_config, 'swiss', t.target_score);

  if cur < round_limit then
    next_round := cur + 1;
    if exists (select 1 from public.beylive_matches where tournament_id = tid and round_no = next_round) then
      update public.tournaments set current_round = next_round where id = tid;
      return;
    end if;

    for pool_no_i in 1..pool_count loop
      perform public.create_beylive_swiss_pool_round(tid, pool_no_i, next_round, swiss_target);
    end loop;

    update public.tournaments set current_round = next_round where id = tid;
    return;
  end if;

  advance_count := public.beylive_swiss_advance_count(player_count, pool_count, t.format_config);

  create temp table if not exists _swiss_pool_standings (
    pool_no int,
    user_id uuid,
    seed int,
    wins int,
    losses int,
    points int,
    against int,
    pool_rank int
  ) on commit drop;
  delete from _swiss_pool_standings where true;

  insert into _swiss_pool_standings (pool_no, user_id, seed, wins, losses, points, against)
  select
    tp.pool_no,
    tp.user_id,
    tp.seed,
    coalesce(sum(case when bm.status = 'completed' and mp.result = 'win' then 1 else 0 end), 0),
    coalesce(sum(case when bm.status = 'completed' and mp.result = 'loss' then 1 else 0 end), 0),
    coalesce(sum(case when bm.status = 'completed' then mp.score else 0 end), 0),
    coalesce(sum(case when bm.status = 'completed' then mt.total_score - mp.score else 0 end), 0)
  from public.tournament_players tp
  left join public.beylive_matches bm
    on bm.tournament_id = tid
    and bm.bracket = 'pool_' || tp.pool_no
  left join public.beylive_match_players mp
    on mp.match_id = bm.id
    and mp.user_id = tp.user_id
  left join lateral (
    select coalesce(sum(x.score), 0) as total_score
    from public.beylive_match_players x
    where x.match_id = bm.id
  ) mt on true
  where tp.tournament_id = tid
    and tp.status = 'joined'
    and tp.pool_no is not null
  group by tp.pool_no, tp.user_id, tp.seed;

  update _swiss_pool_standings s
  set pool_rank = ranked.pool_rank
  from (
    select user_id, row_number() over (
      partition by pool_no
      order by wins desc, (points - against) desc, points desc, losses asc, seed nulls last, user_id
    ) as pool_rank
    from _swiss_pool_standings
  ) ranked
  where ranked.user_id = s.user_id;

  select array_agg(user_id order by seed_order)
  into ids
  from (
    select
      user_id,
      row_number() over (
        order by pool_rank, pool_no, wins desc, (points - against) desc, points desc, losses asc, seed nulls last, user_id
      ) as seed_order
    from _swiss_pool_standings
  ) seeded
  where seed_order <= advance_count;

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

  select coalesce(max(round_no), 0) + 1
  into next_round
  from public.beylive_matches
  where tournament_id = tid;

  knockout_target := public.beylive_swiss_stage_target_score(t.format_config, 'knockout', greatest(t.target_score, 7));
  seed_slots := public.beylive_seed_slots(n);
  slot_idx := 1;
  while slot_idx <= array_length(seed_slots, 1) loop
    slot_a := seed_slots[slot_idx];
    slot_b := seed_slots[slot_idx + 1];

    if slot_a <= n and slot_b <= n then
      perform public.create_beylive_match(tid, next_round, 'main', next_match_no, next_match_no, knockout_target, array[ids[slot_a], ids[slot_b]]);
      next_match_no := next_match_no + 1;
    elsif slot_a <= n then
      perform public.create_beylive_match(tid, next_round, 'main', next_match_no, next_match_no, knockout_target, array[ids[slot_a]]);
      next_match_no := next_match_no + 1;
    elsif slot_b <= n then
      perform public.create_beylive_match(tid, next_round, 'main', next_match_no, next_match_no, knockout_target, array[ids[slot_b]]);
      next_match_no := next_match_no + 1;
    end if;

    slot_idx := slot_idx + 2;
  end loop;

  update public.tournaments set current_round = next_round where id = tid;
end;
$$;

create or replace function public.start_beylive(tid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tournament_format text;
begin
  select format into tournament_format from public.tournaments where id = tid;

  if tournament_format = 'swiss' then
    perform public.start_beylive_swiss_top_cut(tid);
  else
    perform public.start_beylive_before_swiss_top_cut_20260824(tid);
  end if;
end;
$$;

create or replace function public.advance_beylive_round(tid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tournament_format text;
begin
  select format into tournament_format from public.tournaments where id = tid;

  if tournament_format = 'swiss' then
    perform public.advance_beylive_swiss_top_cut(tid);
  else
    perform public.advance_beylive_round_before_swiss_top_cut_20260824(tid);
  end if;
end;
$$;

create or replace function public.draw_group_stage_pools(tid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  pool_count int;
  joined_count int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.host <> auth.uid() then raise exception 'not_allowed'; end if;
  if t.format not in ('group_stage', 'swiss') then raise exception 'wrong_format'; end if;
  if t.status <> 'open' then raise exception 'tournament_not_open'; end if;

  select count(*) into joined_count
  from public.tournament_players
  where tournament_id = tid
    and status = 'joined';

  pool_count := case
    when t.format = 'swiss' then public.beylive_swiss_pool_count(t.max_players, joined_count, t.format_config)
    else public.beylive_group_stage_pool_count(t.max_players, t.format_config)
  end;

  if joined_count < pool_count * 2 then
    raise exception 'not_enough_players_for_groups';
  end if;

  update public.tournament_players
  set pool_no = null
  where tournament_id = tid
    and status = 'joined'
    and pool_no is not null
    and (pool_no < 1 or pool_no > pool_count);

  perform public.assign_group_stage_pools(tid, pool_count);
end;
$$;

create or replace function public.set_tournament_player_pool(tid uuid, p_user_id uuid, p_pool_no int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  pool_count int;
  joined_count int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.host <> auth.uid() then raise exception 'not_allowed'; end if;
  if t.format not in ('group_stage', 'swiss') then raise exception 'wrong_format'; end if;
  if t.status <> 'open' then raise exception 'tournament_not_open'; end if;

  select count(*) into joined_count
  from public.tournament_players
  where tournament_id = tid
    and status = 'joined';

  pool_count := case
    when t.format = 'swiss' then public.beylive_swiss_pool_count(t.max_players, joined_count, t.format_config)
    else public.beylive_group_stage_pool_count(t.max_players, t.format_config)
  end;

  if p_pool_no is not null and p_pool_no not between 1 and pool_count then
    raise exception 'invalid_pool';
  end if;

  update public.tournament_players
  set pool_no = p_pool_no
  where tournament_id = tid and user_id = p_user_id and status = 'joined';

  if not found then raise exception 'player_not_found'; end if;
end;
$$;

create or replace function public.ensure_beylive_third_place_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.beylive_matches;
  tournament_format text;
  current_main_count int;
  current_player_count int;
  previous_round int;
  previous_winner_count int;
  previous_main_count int;
  semifinal_losers uuid[];
begin
  select * into m from public.beylive_matches where id = new.match_id;
  if m is null or m.bracket <> 'main' then return new; end if;

  select format into tournament_format from public.tournaments where id = m.tournament_id;
  if tournament_format not in ('single_elimination', 'group_stage', 'swiss') then return new; end if;

  select count(*) into current_player_count
  from public.beylive_match_players
  where match_id = m.id;
  if current_player_count <> 2 then return new; end if;

  select count(*) into current_main_count
  from public.beylive_matches
  where tournament_id = m.tournament_id
    and round_no = m.round_no
    and bracket = 'main';
  if current_main_count <> 1 then return new; end if;

  select max(round_no) into previous_round
  from public.beylive_matches
  where tournament_id = m.tournament_id
    and bracket = 'main'
    and round_no < m.round_no;
  if previous_round is null then return new; end if;

  select count(*) into previous_winner_count
  from public.beylive_matches
  where tournament_id = m.tournament_id
    and round_no = previous_round
    and bracket = 'main'
    and status = 'completed'
    and winner_id is not null;
  if previous_winner_count <> 2 then return new; end if;

  select count(*) into previous_main_count
  from public.beylive_matches bm
  where bm.tournament_id = m.tournament_id
    and bm.round_no = previous_round
    and bm.bracket = 'main'
    and bm.status = 'completed'
    and bm.winner_id is not null
    and (
      select count(*)
      from public.beylive_match_players mp
      where mp.match_id = bm.id
    ) = 2;
  if previous_main_count <> 2 then return new; end if;

  if exists (
    select 1
    from public.beylive_matches
    where tournament_id = m.tournament_id
      and round_no = m.round_no
      and bracket = 'losers'
  ) then
    return new;
  end if;

  select array_agg(user_id order by match_no, slot_no) into semifinal_losers
  from (
    select bm.match_no, mp.slot_no, mp.user_id
    from public.beylive_matches bm
    join public.beylive_match_players mp on mp.match_id = bm.id
    where bm.tournament_id = m.tournament_id
      and bm.round_no = previous_round
      and bm.bracket = 'main'
      and bm.status = 'completed'
      and bm.winner_id is not null
      and mp.user_id <> bm.winner_id
    order by bm.match_no, mp.slot_no
  ) losers;

  if coalesce(array_length(semifinal_losers, 1), 0) <> 2 then return new; end if;

  perform public.create_beylive_match(
    m.tournament_id,
    m.round_no,
    'losers',
    2,
    2,
    m.target_score,
    semifinal_losers
  );

  return new;
end;
$$;

revoke all on function public.beylive_swiss_pool_count(int, int, jsonb) from public, anon, authenticated;
revoke all on function public.beylive_swiss_round_limit(int, int, jsonb) from public, anon, authenticated;
revoke all on function public.beylive_swiss_advance_count(int, int, jsonb) from public, anon, authenticated;
revoke all on function public.beylive_swiss_stage_target_score(jsonb, text, int) from public, anon, authenticated;
revoke all on function public.create_beylive_swiss_pool_round(uuid, int, int, int) from public, anon, authenticated;
revoke all on function public.start_beylive_swiss_top_cut(uuid) from public, anon, authenticated;
revoke all on function public.advance_beylive_swiss_top_cut(uuid) from public, anon, authenticated;
revoke all on function public.start_beylive_before_swiss_top_cut_20260824(uuid) from public, anon, authenticated;
revoke all on function public.advance_beylive_round_before_swiss_top_cut_20260824(uuid) from public, anon, authenticated;

grant execute on function public.beylive_swiss_pool_count(int, int, jsonb) to service_role;
grant execute on function public.beylive_swiss_round_limit(int, int, jsonb) to service_role;
grant execute on function public.beylive_swiss_advance_count(int, int, jsonb) to service_role;
grant execute on function public.beylive_swiss_stage_target_score(jsonb, text, int) to service_role;
grant execute on function public.create_beylive_swiss_pool_round(uuid, int, int, int) to service_role;
grant execute on function public.start_beylive_swiss_top_cut(uuid) to service_role;
grant execute on function public.advance_beylive_swiss_top_cut(uuid) to service_role;
grant execute on function public.start_beylive_before_swiss_top_cut_20260824(uuid) to service_role;
grant execute on function public.advance_beylive_round_before_swiss_top_cut_20260824(uuid) to service_role;

revoke execute on function public.start_beylive(uuid) from public, anon;
revoke execute on function public.advance_beylive_round(uuid) from public, anon;
revoke execute on function public.draw_group_stage_pools(uuid) from public, anon;
revoke execute on function public.set_tournament_player_pool(uuid, uuid, int) from public, anon;
grant execute on function public.start_beylive(uuid) to authenticated, service_role;
grant execute on function public.advance_beylive_round(uuid) to authenticated, service_role;
grant execute on function public.draw_group_stage_pools(uuid) to authenticated, service_role;
grant execute on function public.set_tournament_player_pool(uuid, uuid, int) to authenticated, service_role;
