-- Fix knockout seeding and double-elimination advancement.
--
-- Previously first-round knockout pairing used adjacent seeds (1v2, 3v4).
-- Double elimination also lost the undefeated winners-bracket finalist once
-- the event reached losers-bracket-only rounds, so larger brackets could
-- complete without a grand final. This keeps existing non-double formats on
-- the legacy advancement function and replaces only the affected paths.

create or replace function public.beylive_seed_slots(p_count int)
returns int[]
language plpgsql
immutable
set search_path = public
as $$
declare
  bracket_size int := 2;
  current_size int := 2;
  slots int[] := array[1, 2];
  next_slots int[];
  seed int;
begin
  p_count := greatest(2, least(256, p_count));
  while bracket_size < p_count loop
    bracket_size := bracket_size * 2;
  end loop;

  while current_size < bracket_size loop
    next_slots := '{}'::int[];
    foreach seed in array slots loop
      next_slots := next_slots || seed;
      next_slots := next_slots || (current_size * 2 + 1 - seed);
    end loop;
    slots := next_slots;
    current_size := current_size * 2;
  end loop;

  return slots;
end;
$$;

alter function public.start_beylive(uuid) rename to start_beylive_legacy_20260820;
alter function public.advance_beylive_round(uuid) rename to advance_beylive_round_legacy_20260820;

create or replace function public.start_beylive(tid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  ids uuid[];
  n int;
  i int;
  match_no int := 1;
  effective_target int;
  seed_slots int[];
  seed_a int;
  seed_b int;
  players uuid[];
begin
  select * into t from public.tournaments where id = tid for update;

  if t is null or t.format not in ('single_elimination', 'double_elimination') then
    perform public.start_beylive_legacy_20260820(tid);
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
  where tp.tournament_id = tid and tp.status = 'joined';

  n := coalesce(array_length(ids, 1), 0);
  if n < 2 then raise exception 'not_enough_players'; end if;

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

  seed_slots := public.beylive_seed_slots(n);
  i := 1;
  while i <= coalesce(array_length(seed_slots, 1), 0) loop
    seed_a := seed_slots[i];
    seed_b := seed_slots[i + 1];
    players := '{}'::uuid[];

    if seed_a <= n then
      players := players || ids[seed_a];
    end if;
    if seed_b <= n then
      players := players || ids[seed_b];
    end if;

    if coalesce(array_length(players, 1), 0) > 0 then
      perform public.create_beylive_match(
        tid,
        1,
        'main',
        match_no,
        match_no,
        effective_target,
        players
      );
      match_no := match_no + 1;
    end if;

    i := i + 2;
  end loop;
end;
$$;

create or replace function public.advance_beylive_double_elimination_round(tid uuid)
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
  loser_ids uuid[];
  loser_winners uuid[];
  pool uuid[];
  main_count int;
  pool_count int;
  i int;
  next_match_no int := 1;
  players uuid[];
  champion_id uuid;
  main_champion_id uuid;
  grand_completed_count int;
  grand_player_ids uuid[];
begin
  if auth.uid() is null then raise exception 'login_required'; end if;

  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.format <> 'double_elimination' then
    perform public.advance_beylive_round_legacy_20260820(tid);
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

  select winner_id
  into main_champion_id
  from public.beylive_matches
  where tournament_id = tid
    and bracket = 'main'
    and status = 'completed'
    and winner_id is not null
  order by round_no desc, match_no desc
  limit 1;

  if exists (
    select 1
    from public.beylive_matches
    where tournament_id = tid
      and round_no = cur
      and bracket = 'grand'
      and status = 'completed'
      and winner_id is not null
  ) then
    select winner_id
    into champion_id
    from public.beylive_matches
    where tournament_id = tid
      and round_no = cur
      and bracket = 'grand'
      and status = 'completed'
      and winner_id is not null
    order by match_no desc
    limit 1;

    select count(*)
    into grand_completed_count
    from public.beylive_matches
    where tournament_id = tid
      and bracket = 'grand'
      and status = 'completed'
      and winner_id is not null;

    if grand_completed_count = 1 and main_champion_id is not null and champion_id <> main_champion_id then
      select array_agg(mp.user_id order by case when mp.user_id = main_champion_id then 0 else 1 end, mp.slot_no)
      into grand_player_ids
      from public.beylive_matches bm
      join public.beylive_match_players mp on mp.match_id = bm.id
      where bm.tournament_id = tid
        and bm.round_no = cur
        and bm.bracket = 'grand'
        and bm.status = 'completed';

      if coalesce(array_length(grand_player_ids, 1), 0) = 2 then
        next_round := cur + 1;
        perform public.create_beylive_match(
          tid,
          next_round,
          'grand',
          1,
          1,
          t.target_score,
          grand_player_ids
        );
        update public.tournaments set current_round = next_round where id = tid;
        return;
      end if;
    end if;

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
  next_round := cur + 1;

  if main_count > 1 then
    i := 1;
    while i <= main_count loop
      if i = main_count then
        players := array[ids[i]];
      else
        players := array[ids[i], ids[i + 1]];
      end if;
      perform public.create_beylive_match(tid, next_round, 'main', next_match_no, next_match_no, t.target_score, players);
      next_match_no := next_match_no + 1;
      i := i + 2;
    end loop;

    i := 1;
    while i <= pool_count loop
      if i = pool_count then
        players := array[pool[i]];
      else
        players := array[pool[i], pool[i + 1]];
      end if;
      perform public.create_beylive_match(tid, next_round, 'losers', next_match_no, next_match_no, t.target_score, players);
      next_match_no := next_match_no + 1;
      i := i + 2;
    end loop;

    update public.tournaments set current_round = next_round where id = tid;
    return;
  end if;

  if main_count = 1 and pool_count > 1 then
    i := 1;
    while i <= pool_count loop
      if i = pool_count then
        players := array[pool[i]];
      else
        players := array[pool[i], pool[i + 1]];
      end if;
      perform public.create_beylive_match(tid, next_round, 'losers', next_match_no, next_match_no, t.target_score, players);
      next_match_no := next_match_no + 1;
      i := i + 2;
    end loop;

    update public.tournaments set current_round = next_round where id = tid;
    return;
  end if;

  if main_count = 1 and pool_count = 1 then
    perform public.create_beylive_match(tid, next_round, 'grand', 1, 1, t.target_score, array[ids[1], pool[1]]);
    update public.tournaments set current_round = next_round where id = tid;
    return;
  end if;

  if main_count = 1 and pool_count = 0 then
    update public.tournaments
    set status = 'completed',
        live_enabled = false,
        winner_id = ids[1],
        winner_team_id = null
    where id = tid;
    return;
  end if;

  if main_count = 0 and pool_count > 1 then
    i := 1;
    while i <= pool_count loop
      if i = pool_count then
        players := array[pool[i]];
      else
        players := array[pool[i], pool[i + 1]];
      end if;
      perform public.create_beylive_match(tid, next_round, 'losers', next_match_no, next_match_no, t.target_score, players);
      next_match_no := next_match_no + 1;
      i := i + 2;
    end loop;

    update public.tournaments set current_round = next_round where id = tid;
    return;
  end if;

  if main_count = 0 and pool_count = 1 and main_champion_id is not null then
    perform public.create_beylive_match(tid, next_round, 'grand', 1, 1, t.target_score, array[main_champion_id, pool[1]]);
    update public.tournaments set current_round = next_round where id = tid;
    return;
  end if;

  update public.tournaments
  set status = 'completed',
      live_enabled = false,
      winner_id = coalesce(
        case when pool_count = 1 then pool[1] else null end,
        main_champion_id,
        winner_id
      ),
      winner_team_id = null
  where id = tid;
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

  if tournament_format = 'double_elimination' then
    perform public.advance_beylive_double_elimination_round(tid);
  else
    perform public.advance_beylive_round_legacy_20260820(tid);
  end if;
end;
$$;

revoke all on function public.beylive_seed_slots(int) from public;
revoke all on function public.start_beylive_legacy_20260820(uuid) from public;
revoke all on function public.start_beylive_legacy_20260820(uuid) from anon;
revoke all on function public.start_beylive_legacy_20260820(uuid) from authenticated;
revoke all on function public.advance_beylive_round_legacy_20260820(uuid) from public;
revoke all on function public.advance_beylive_round_legacy_20260820(uuid) from anon;
revoke all on function public.advance_beylive_round_legacy_20260820(uuid) from authenticated;
revoke all on function public.advance_beylive_double_elimination_round(uuid) from public;
revoke all on function public.advance_beylive_double_elimination_round(uuid) from anon;
revoke all on function public.advance_beylive_double_elimination_round(uuid) from authenticated;

revoke execute on function public.start_beylive(uuid) from public;
revoke execute on function public.advance_beylive_round(uuid) from public;
grant execute on function public.start_beylive(uuid) to authenticated;
grant execute on function public.advance_beylive_round(uuid) to authenticated;
