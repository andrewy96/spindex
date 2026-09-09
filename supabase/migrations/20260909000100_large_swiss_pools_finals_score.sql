-- Allow large Swiss pool events, including 80 players in 20 groups of four.
-- Existing default pool counts and score targets remain unchanged.
alter table public.tournament_players drop constraint if exists tournament_players_pool_no_check;
alter table public.tournament_players add constraint tournament_players_pool_no_check
  check (pool_no is null or pool_no between 1 and 128);

alter table public.beylive_matches drop constraint if exists beylive_matches_bracket_check;
alter table public.beylive_matches add constraint beylive_matches_bracket_check check (
  bracket in ('main', 'losers', 'grand', 'leaderboard')
  or bracket ~ '^pool_([1-9]|[1-9][0-9]|1[01][0-9]|12[0-8])$'
);

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
  max_groups int := least(128, greatest(1, floor(event_size::numeric / 2)::int));
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
  pool_count int := greatest(1, least(128, coalesce(p_pool_count, 1)));
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

create or replace function public.beylive_swiss_knockout_target_score(
  p_format_config jsonb,
  p_remaining_players int,
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
  base_score int := public.beylive_swiss_stage_target_score(p_format_config, 'knockout', p_fallback);
begin
  if p_remaining_players > 4 then return base_score; end if;

  select (stage->>'semifinalFinalTargetScore')::int into configured_score
  from jsonb_array_elements(case
    when jsonb_typeof(p_format_config->'stages') = 'array' then p_format_config->'stages'
    else '[]'::jsonb end) with ordinality as items(stage, ordinality)
  where (stage->>'type' = 'knockout' or stage->>'id' = 'knockout')
    and coalesce(stage->>'semifinalFinalTargetScore', '') ~ '^[0-9]+$'
  order by ordinality limit 1;

  return greatest(1, least(30, coalesce(configured_score, base_score)));
end;
$$;

revoke all on function public.beylive_swiss_knockout_target_score(jsonb, int, int) from public, anon, authenticated;
grant execute on function public.beylive_swiss_knockout_target_score(jsonb, int, int) to service_role;

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

    knockout_target := public.beylive_swiss_knockout_target_score(t.format_config, n, greatest(t.target_score, 7));
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

  knockout_target := public.beylive_swiss_knockout_target_score(t.format_config, n, greatest(t.target_score, 7));
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

create or replace function public.ensure_beylive_third_place_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.beylive_matches;
  tournament_format text;
  tournament_config jsonb;
  configured_third_place boolean;
  current_main_count int;
  current_player_count int;
  previous_round int;
  previous_winner_count int;
  previous_main_count int;
  semifinal_losers uuid[];
begin
  select * into m from public.beylive_matches where id = new.match_id;
  if m is null or m.bracket <> 'main' then return new; end if;

  select format, format_config into tournament_format, tournament_config from public.tournaments where id = m.tournament_id;
  if tournament_format not in ('single_elimination', 'group_stage', 'swiss') then return new; end if;

  -- Respect the Swiss knockout placement option; legacy plans keep their behavior.
  if tournament_format = 'swiss' then
    select (stage->>'thirdPlace')::boolean into configured_third_place
    from jsonb_array_elements(case
      when jsonb_typeof(tournament_config->'stages') = 'array' then tournament_config->'stages'
      else '[]'::jsonb end) with ordinality as items(stage, ordinality)
    where (stage->>'type' = 'knockout' or stage->>'id' = 'knockout')
      and jsonb_typeof(stage->'thirdPlace') = 'boolean'
    order by ordinality limit 1;
    if configured_third_place = false then return new; end if;
  end if;

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
