-- Fix free-for-all and leaderboard BEYLIVE execution.
--
-- The previous leaderboard path started live mode without creating any
-- scoreable matches. Free-for-all created heats, but only heat winners moved
-- on, which skipped the configured top cut and produced weak advancement for
-- larger fields. This patch:
--   - creates balanced max-four-player leaderboard scoring heats
--   - finalizes leaderboard by standings
--   - creates balanced FFA heats
--   - advances FFA by standings through a top cut and shrinking heats
--   - finishes FFA from the final heat

create or replace function public.beylive_player_standings(
  tid uuid,
  p_bracket text default null,
  p_round_no int default null
)
returns table (
  user_id uuid,
  seed int,
  wins int,
  losses int,
  points int,
  against int,
  diff int,
  played int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tp.user_id,
    tp.seed,
    coalesce(sum(case when mp.result = 'win' then 1 else 0 end), 0)::int as wins,
    coalesce(sum(case when mp.result = 'loss' then 1 else 0 end), 0)::int as losses,
    coalesce(sum(case when mp.match_id is not null then mp.score else 0 end), 0)::int as points,
    coalesce(sum(case when mp.match_id is not null then mt.total_score - mp.score else 0 end), 0)::int as against,
    (
      coalesce(sum(case when mp.match_id is not null then mp.score else 0 end), 0)
        - coalesce(sum(case when mp.match_id is not null then mt.total_score - mp.score else 0 end), 0)
    )::int as diff,
    count(mp.match_id)::int as played
  from public.tournament_players tp
  left join public.beylive_matches bm
    on bm.tournament_id = tid
    and bm.status = 'completed'
    and (p_bracket is null or bm.bracket = p_bracket)
    and (p_round_no is null or bm.round_no = p_round_no)
  left join public.beylive_match_players mp
    on mp.match_id = bm.id
    and mp.user_id = tp.user_id
  left join lateral (
    select coalesce(sum(x.score), 0)::int as total_score
    from public.beylive_match_players x
    where x.match_id = bm.id
  ) mt on true
  where tp.tournament_id = tid
    and tp.status = 'joined'
  group by tp.user_id, tp.seed;
$$;

create or replace function public.beylive_format_top_cut(
  p_format text,
  p_player_count int,
  p_format_config jsonb
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  default_cut int;
  configured_cut int;
  stages jsonb;
begin
  default_cut := case
    when p_player_count >= 32 then 16
    when p_player_count >= 16 then 8
    when p_player_count >= 8 then 4
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
  where stage->>'type' = p_format
    and coalesce(stage->>'advanceCount', '') ~ '^[0-9]+$'
  order by ordinality
  limit 1;

  return least(
    greatest(2, coalesce(configured_cut, default_cut)),
    greatest(2, p_player_count)
  );
end;
$$;

create or replace function public.create_beylive_player_heats(
  tid uuid,
  p_round_no int,
  p_bracket text,
  p_target_score int,
  p_players uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := coalesce(array_length(p_players, 1), 0);
  group_count int;
  idx int;
  wave int;
  offset_idx int;
  group_no int;
  position_no int;
  match_no int := 1;
  heat record;
begin
  if n = 0 then
    raise exception 'no_players';
  end if;

  if n = 1 then
    perform public.create_beylive_match(tid, p_round_no, p_bracket, 1, 1, p_target_score, p_players);
    return;
  end if;

  group_count := greatest(1, ceiling(n::numeric / 4)::int);

  create temp table if not exists _beylive_heat_slots (
    user_id uuid primary key,
    group_no int not null,
    position_no int not null,
    slot_idx int not null
  ) on commit drop;
  delete from _beylive_heat_slots where true;

  for idx in 1..n loop
    wave := floor((idx - 1)::numeric / group_count)::int;
    offset_idx := mod(idx - 1, group_count);
    group_no := case
      when mod(wave, 2) = 0 then offset_idx + 1
      else group_count - offset_idx
    end;
    position_no := wave + 1;

    insert into _beylive_heat_slots (user_id, group_no, position_no, slot_idx)
    values (p_players[idx], group_no, position_no, idx);
  end loop;

  for heat in
    select group_no, array_agg(user_id order by position_no, slot_idx) as player_ids
    from _beylive_heat_slots
    group by group_no
    order by group_no
  loop
    perform public.create_beylive_match(
      tid,
      p_round_no,
      p_bracket,
      match_no,
      match_no,
      p_target_score,
      heat.player_ids
    );
    match_no := match_no + 1;
  end loop;
end;
$$;

alter function public.start_beylive(uuid) rename to start_beylive_swiss_20260820;
alter function public.advance_beylive_round(uuid) rename to advance_beylive_round_swiss_20260820;

create or replace function public.start_beylive_ffa_leaderboard(tid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  ids uuid[];
  n int;
  effective_target int;
  bracket_name text;
begin
  select * into t from public.tournaments where id = tid for update;

  if t is null or t.format not in ('free_for_all', 'leaderboard') then
    perform public.start_beylive_swiss_20260820(tid);
    return;
  end if;

  if auth.uid() is null then raise exception 'login_required'; end if;
  if not public.can_manage_beylive(tid, auth.uid()) then raise exception 'not_allowed'; end if;
  if t.live_enabled or t.status = 'started' or exists (select 1 from public.beylive_matches where tournament_id = tid) then
    raise exception 'beylive_already_started';
  end if;

  select array_agg(tp.user_id order by coalesce(tp.seed, 999999), tp.created_at)
  into ids
  from public.tournament_players tp
  where tp.tournament_id = tid
    and tp.status = 'joined';

  n := coalesce(array_length(ids, 1), 0);
  if n < 2 then raise exception 'not_enough_players'; end if;

  effective_target := t.target_score;
  bracket_name := case when t.format = 'leaderboard' then 'leaderboard' else 'main' end;

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

  perform public.create_beylive_player_heats(tid, 1, bracket_name, effective_target, ids);
end;
$$;

create or replace function public.advance_beylive_ffa_leaderboard(tid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  cur int;
  next_round int;
  player_count int;
  active_count int;
  top_cut int;
  next_count int;
  ids uuid[];
  n int;
  champion_id uuid;
  stage_target_score int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;

  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.format not in ('free_for_all', 'leaderboard') then
    perform public.advance_beylive_round_swiss_20260820(tid);
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

  if t.format = 'leaderboard' then
    select s.user_id
    into champion_id
    from public.beylive_player_standings(tid, 'leaderboard', null) s
    where s.played > 0
    order by s.wins desc, s.diff desc, s.points desc, s.losses asc, s.seed nulls last, s.user_id
    limit 1;

    if champion_id is null then
      raise exception 'leaderboard_has_no_scores';
    end if;

    update public.tournaments
    set status = 'completed',
        live_enabled = false,
        winner_id = champion_id,
        winner_team_id = null
    where id = tid;
    return;
  end if;

  select count(*) into player_count
  from public.tournament_players
  where tournament_id = tid
    and status = 'joined';

  select count(distinct mp.user_id)
  into active_count
  from public.beylive_matches bm
  join public.beylive_match_players mp on mp.match_id = bm.id
  where bm.tournament_id = tid
    and bm.round_no = cur
    and bm.bracket = 'main'
    and bm.status = 'completed';

  if coalesce(active_count, 0) <= 4 then
    select s.user_id
    into champion_id
    from public.beylive_player_standings(tid, 'main', cur) s
    where s.played > 0
    order by s.wins desc, s.diff desc, s.points desc, s.losses asc, s.seed nulls last, s.user_id
    limit 1;

    update public.tournaments
    set status = 'completed',
        live_enabled = false,
        winner_id = champion_id,
        winner_team_id = null
    where id = tid;
    return;
  end if;

  top_cut := public.beylive_format_top_cut('free_for_all', player_count, t.format_config);
  if active_count > top_cut then
    next_count := top_cut;
  else
    next_count := greatest(4, ceiling(active_count::numeric / 2)::int);
  end if;
  next_count := least(active_count, greatest(1, next_count));

  select array_agg(ranked.user_id order by ranked.wins desc, ranked.diff desc, ranked.points desc, ranked.losses asc, ranked.seed nulls last, ranked.user_id)
  into ids
  from (
    select *
    from public.beylive_player_standings(tid, 'main', cur) s
    where s.played > 0
    order by s.wins desc, s.diff desc, s.points desc, s.losses asc, s.seed nulls last, s.user_id
    limit next_count
  ) ranked;

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
  if exists (
    select 1
    from public.beylive_matches
    where tournament_id = tid
      and round_no = next_round
  ) then
    update public.tournaments set current_round = next_round where id = tid;
    return;
  end if;

  stage_target_score := case when n <= 4 then greatest(t.target_score, 7) else t.target_score end;
  perform public.create_beylive_player_heats(tid, next_round, 'main', stage_target_score, ids);
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

  if tournament_format in ('free_for_all', 'leaderboard') then
    perform public.start_beylive_ffa_leaderboard(tid);
  else
    perform public.start_beylive_swiss_20260820(tid);
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

  if tournament_format in ('free_for_all', 'leaderboard') then
    perform public.advance_beylive_ffa_leaderboard(tid);
  else
    perform public.advance_beylive_round_swiss_20260820(tid);
  end if;
end;
$$;

revoke all on function public.beylive_player_standings(uuid, text, int) from public, anon, authenticated;
revoke all on function public.beylive_format_top_cut(text, int, jsonb) from public, anon, authenticated;
revoke all on function public.create_beylive_player_heats(uuid, int, text, int, uuid[]) from public, anon, authenticated;
revoke all on function public.start_beylive_ffa_leaderboard(uuid) from public, anon, authenticated;
revoke all on function public.advance_beylive_ffa_leaderboard(uuid) from public, anon, authenticated;
revoke all on function public.start_beylive_swiss_20260820(uuid) from public, anon, authenticated;
revoke all on function public.advance_beylive_round_swiss_20260820(uuid) from public, anon, authenticated;

grant execute on function public.beylive_player_standings(uuid, text, int) to service_role;
grant execute on function public.beylive_format_top_cut(text, int, jsonb) to service_role;
grant execute on function public.create_beylive_player_heats(uuid, int, text, int, uuid[]) to service_role;
grant execute on function public.start_beylive_ffa_leaderboard(uuid) to service_role;
grant execute on function public.advance_beylive_ffa_leaderboard(uuid) to service_role;
grant execute on function public.start_beylive_swiss_20260820(uuid) to service_role;
grant execute on function public.advance_beylive_round_swiss_20260820(uuid) to service_role;

revoke execute on function public.start_beylive(uuid) from public, anon;
revoke execute on function public.advance_beylive_round(uuid) from public, anon;
grant execute on function public.start_beylive(uuid) to authenticated, service_role;
grant execute on function public.advance_beylive_round(uuid) to authenticated, service_role;
