-- Make group_stage BEYLIVE honor customized group counts and top cuts.
--
-- The host UI already stores a group-stage plan in tournaments.format_config,
-- but the execution path still assumed 8 pools and a Top 16 bracket. For a
-- 16-player event, the normal plan is 4 pools of 4, top 2 per pool, then Top 8.

create or replace function public.beylive_group_stage_pool_count(
  p_player_cap int,
  p_format_config jsonb
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  player_cap int := greatest(2, least(256, coalesce(p_player_cap, 16)));
  default_groups int;
  max_groups int;
  configured_groups int;
  stages jsonb;
begin
  default_groups := least(8, greatest(2, ceiling(player_cap::numeric / 4)::int));
  max_groups := least(8, greatest(2, floor(player_cap::numeric / 2)::int));

  stages := case
    when jsonb_typeof(coalesce(p_format_config, '{}'::jsonb)->'stages') = 'array'
      then coalesce(p_format_config, '{}'::jsonb)->'stages'
    else '[]'::jsonb
  end;

  select (stage->>'groups')::int
  into configured_groups
  from jsonb_array_elements(stages) with ordinality as items(stage, ordinality)
  where (stage->>'type' = 'group' or stage->>'id' = 'group')
    and coalesce(stage->>'groups', '') ~ '^[0-9]+$'
  order by ordinality
  limit 1;

  return least(max_groups, greatest(2, coalesce(configured_groups, default_groups)));
end;
$$;

create or replace function public.beylive_group_stage_advance_count(
  p_player_cap int,
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
  player_cap int := greatest(2, least(256, coalesce(p_player_cap, 16)));
  pool_count int := greatest(2, least(8, coalesce(p_pool_count, 4)));
  default_cut int;
  configured_cut int;
  stages jsonb;
begin
  default_cut := case
    when player_cap >= 32 then 16
    when player_cap >= 16 then 8
    when player_cap >= 8 then 4
    else 2
  end;

  stages := case
    when jsonb_typeof(coalesce(p_format_config, '{}'::jsonb)->'stages') = 'array'
      then coalesce(p_format_config, '{}'::jsonb)->'stages'
    else '[]'::jsonb
  end;

  select (stage->>'advanceCount')::int
  into configured_cut
  from jsonb_array_elements(stages) with ordinality as items(stage, ordinality)
  where (stage->>'type' = 'group' or stage->>'id' = 'group')
    and coalesce(stage->>'advanceCount', '') ~ '^[0-9]+$'
  order by ordinality
  limit 1;

  return least(
    player_cap,
    16,
    greatest(pool_count, coalesce(configured_cut, default_cut))
  );
end;
$$;

create or replace function public.create_beylive_group_stage_matches(tid uuid, p_target_score int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p int;
  pool_count int;
  pool_ids uuid[];
  ring uuid[];
  ring_count int;
  round_no int;
  match_no int := 1;
  left_id uuid;
  right_id uuid;
  last_id uuid;
  k int;
begin
  select coalesce(max(pool_no), 0)
  into pool_count
  from public.tournament_players
  where tournament_id = tid
    and status = 'joined'
    and pool_no is not null;

  for p in 1..pool_count loop
    select array_agg(user_id order by coalesce(seed, 999999), created_at)
    into pool_ids
    from public.tournament_players
    where tournament_id = tid and status = 'joined' and pool_no = p;

    if coalesce(array_length(pool_ids, 1), 0) < 2 then
      continue;
    end if;

    ring := pool_ids;
    if array_length(ring, 1) % 2 = 1 then
      ring := ring || null::uuid;
    end if;
    ring_count := array_length(ring, 1);

    for round_no in 1..(ring_count - 1) loop
      for k in 1..(ring_count / 2) loop
        left_id := ring[k];
        right_id := ring[ring_count + 1 - k];
        if left_id is not null and right_id is not null then
          perform public.create_beylive_match(
            tid, round_no, 'pool_' || p, match_no, match_no, p_target_score, array[left_id, right_id]
          );
          match_no := match_no + 1;
        end if;
      end loop;

      last_id := ring[ring_count];
      if ring_count > 2 then
        for k in reverse ring_count..3 loop
          ring[k] := ring[k - 1];
        end loop;
      end if;
      ring[2] := last_id;
    end loop;
  end loop;
end;
$$;

alter function public.start_beylive(uuid) rename to start_beylive_before_group_config_20260820;
alter function public.advance_beylive_round(uuid) rename to advance_beylive_round_before_group_config_20260820;

create or replace function public.start_beylive_group_stage(tid uuid)
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
begin
  select * into t from public.tournaments where id = tid for update;

  if t is null or t.format <> 'group_stage' then
    perform public.start_beylive_before_group_config_20260820(tid);
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

  pool_count := public.beylive_group_stage_pool_count(t.max_players, t.format_config);
  if n < pool_count * 2 then
    raise exception 'not_enough_players_for_groups';
  end if;

  effective_target := t.target_score;

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

  update public.tournament_players
  set pool_no = null
  where tournament_id = tid
    and status = 'joined'
    and pool_no is not null
    and (pool_no < 1 or pool_no > pool_count);

  perform public.assign_group_stage_pools(tid, pool_count);
  perform public.create_beylive_group_stage_matches(tid, effective_target);
end;
$$;

create or replace function public.advance_beylive_group_stage(tid uuid)
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
  advance_count int;
  seed_slots int[];
  slot_idx int;
  slot_a int;
  slot_b int;
  next_match_no int := 1;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;

  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.format <> 'group_stage' then
    perform public.advance_beylive_round_before_group_config_20260820(tid);
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

  if exists (
    select 1 from public.beylive_matches
    where tournament_id = tid and bracket = 'main'
  ) then
    perform public.advance_beylive_round_before_group_config_20260820(tid);
    return;
  end if;

  next_round := cur + 1;

  if exists (
    select 1
    from public.beylive_matches
    where tournament_id = tid
      and bracket ~ '^pool_[0-9]+$'
      and status not in ('completed', 'cancelled')
  ) then
    update public.tournaments set current_round = next_round where id = tid;
    return;
  end if;

  select count(*) into player_count
  from public.tournament_players
  where tournament_id = tid
    and status = 'joined';

  pool_count := public.beylive_group_stage_pool_count(t.max_players, t.format_config);
  advance_count := least(
    player_count,
    public.beylive_group_stage_advance_count(t.max_players, pool_count, t.format_config)
  );

  create temp table if not exists _gs_standings (
    pool_no int,
    user_id uuid,
    seed int,
    wins int,
    losses int,
    points int,
    against int,
    pool_rank int
  ) on commit drop;
  delete from _gs_standings where true;

  insert into _gs_standings (pool_no, user_id, seed, wins, losses, points, against)
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
    on bm.tournament_id = tid and bm.bracket = 'pool_' || tp.pool_no
  left join public.beylive_match_players mp
    on mp.match_id = bm.id and mp.user_id = tp.user_id
  left join lateral (
    select coalesce(sum(x.score), 0) as total_score
    from public.beylive_match_players x
    where x.match_id = bm.id
  ) mt on true
  where tp.tournament_id = tid and tp.status = 'joined' and tp.pool_no is not null
  group by tp.pool_no, tp.user_id, tp.seed;

  update _gs_standings s
  set pool_rank = ranked.pool_rank
  from (
    select user_id, row_number() over (
      partition by pool_no
      order by wins desc, (points - against) desc, points desc, losses asc, seed nulls last, user_id
    ) as pool_rank
    from _gs_standings
  ) ranked
  where ranked.user_id = s.user_id;

  select array_agg(user_id order by seed_order)
  into ids
  from (
    select user_id, row_number() over (order by pool_rank, pool_no) as seed_order
    from _gs_standings
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

  seed_slots := public.beylive_seed_slots(n);
  slot_idx := 1;
  while slot_idx <= array_length(seed_slots, 1) loop
    slot_a := seed_slots[slot_idx];
    slot_b := seed_slots[slot_idx + 1];

    if slot_a <= n and slot_b <= n then
      perform public.create_beylive_match(tid, next_round, 'main', next_match_no, next_match_no, t.target_score, array[ids[slot_a], ids[slot_b]]);
      next_match_no := next_match_no + 1;
    elsif slot_a <= n then
      perform public.create_beylive_match(tid, next_round, 'main', next_match_no, next_match_no, t.target_score, array[ids[slot_a]]);
      next_match_no := next_match_no + 1;
    elsif slot_b <= n then
      perform public.create_beylive_match(tid, next_round, 'main', next_match_no, next_match_no, t.target_score, array[ids[slot_b]]);
      next_match_no := next_match_no + 1;
    end if;

    slot_idx := slot_idx + 2;
  end loop;

  update public.tournaments set current_round = next_round where id = tid;
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
  if t.format <> 'group_stage' then raise exception 'wrong_format'; end if;
  if t.status <> 'open' then raise exception 'tournament_not_open'; end if;

  pool_count := public.beylive_group_stage_pool_count(t.max_players, t.format_config);

  select count(*) into joined_count
  from public.tournament_players
  where tournament_id = tid
    and status = 'joined';

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
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.host <> auth.uid() then raise exception 'not_allowed'; end if;
  if t.format <> 'group_stage' then raise exception 'wrong_format'; end if;
  if t.status <> 'open' then raise exception 'tournament_not_open'; end if;

  pool_count := public.beylive_group_stage_pool_count(t.max_players, t.format_config);
  if p_pool_no is not null and p_pool_no not between 1 and pool_count then
    raise exception 'invalid_pool';
  end if;

  update public.tournament_players
  set pool_no = p_pool_no
  where tournament_id = tid and user_id = p_user_id and status = 'joined';

  if not found then raise exception 'player_not_found'; end if;
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

  if tournament_format = 'group_stage' then
    perform public.start_beylive_group_stage(tid);
  else
    perform public.start_beylive_before_group_config_20260820(tid);
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

  if tournament_format = 'group_stage' then
    perform public.advance_beylive_group_stage(tid);
  else
    perform public.advance_beylive_round_before_group_config_20260820(tid);
  end if;
end;
$$;

revoke all on function public.beylive_group_stage_pool_count(int, jsonb) from public, anon, authenticated;
revoke all on function public.beylive_group_stage_advance_count(int, int, jsonb) from public, anon, authenticated;
revoke all on function public.create_beylive_group_stage_matches(uuid, int) from public, anon, authenticated;
revoke all on function public.start_beylive_group_stage(uuid) from public, anon, authenticated;
revoke all on function public.advance_beylive_group_stage(uuid) from public, anon, authenticated;
revoke all on function public.start_beylive_before_group_config_20260820(uuid) from public, anon, authenticated;
revoke all on function public.advance_beylive_round_before_group_config_20260820(uuid) from public, anon, authenticated;

grant execute on function public.beylive_group_stage_pool_count(int, jsonb) to service_role;
grant execute on function public.beylive_group_stage_advance_count(int, int, jsonb) to service_role;
grant execute on function public.create_beylive_group_stage_matches(uuid, int) to service_role;
grant execute on function public.start_beylive_group_stage(uuid) to service_role;
grant execute on function public.advance_beylive_group_stage(uuid) to service_role;
grant execute on function public.start_beylive_before_group_config_20260820(uuid) to service_role;
grant execute on function public.advance_beylive_round_before_group_config_20260820(uuid) to service_role;

revoke execute on function public.start_beylive(uuid) from public, anon;
revoke execute on function public.advance_beylive_round(uuid) from public, anon;
grant execute on function public.start_beylive(uuid) to authenticated, service_role;
grant execute on function public.advance_beylive_round(uuid) to authenticated, service_role;

revoke execute on function public.draw_group_stage_pools(uuid) from public, anon;
revoke execute on function public.set_tournament_player_pool(uuid, uuid, int) from public, anon;
grant execute on function public.draw_group_stage_pools(uuid) to authenticated, service_role;
grant execute on function public.set_tournament_player_pool(uuid, uuid, int) to authenticated, service_role;
