-- "Group stage" tournament format: 32+ players split into 8 pools (4 or 5
-- players each — extra players fill the earliest pools first), round-robin
-- within each pool while best-effort avoiding pool-mates who share a club
-- prefix in their display name, then the top 2 of each pool seed a Round of
-- 16 -> Quarterfinal -> Semifinal -> Final knockout bracket.
--
-- Pool matches reuse the existing beylive_matches table with a new family of
-- bracket values ('pool_1'..'pool_8'); the knockout stage reuses the plain
-- 'main' bracket and the generic pairwise-halving logic advance_beylive_round
-- already runs for single_elimination once no format-specific branch claims
-- the round.

alter table public.tournaments
  drop constraint if exists tournaments_format_check;

alter table public.tournaments
  add constraint tournaments_format_check check (
    format in (
      'single_elimination',
      'double_elimination',
      'round_robin',
      'swiss',
      'free_for_all',
      'leaderboard',
      'partner',
      'group_stage'
    )
  );

alter table public.beylive_matches
  drop constraint if exists beylive_matches_bracket_check;

alter table public.beylive_matches
  add constraint beylive_matches_bracket_check check (
    bracket in ('main', 'losers', 'grand', 'leaderboard')
    or bracket ~ '^pool_[1-8]$'
  );

alter table public.tournament_players
  add column if not exists pool_no int check (pool_no is null or pool_no between 1 and 8);

create index if not exists tournament_players_pool_idx
  on public.tournament_players (tournament_id, pool_no);

-- Assigns every joined player to one of `p_pool_count` pools, sized as
-- evenly as possible (earliest pools absorb the remainder), while trying
-- to keep players who share a club prefix (the leading word of their
-- display name) out of the same pool. Best effort: when a club can't be
-- fully spread out, it just lands wherever there is room.
create or replace function public.assign_group_stage_pools(tid uuid, p_pool_count int default 8)
returns void
language plpgsql security definer set search_path = public as $$
declare
  n int;
  base_size int;
  remainder int;
  p int;
  r record;
  chosen_pool int;
begin
  select count(*) into n
  from public.tournament_players
  where tournament_id = tid and status = 'joined';

  if n < p_pool_count * 2 then
    raise exception 'not_enough_players_for_pools';
  end if;

  base_size := n / p_pool_count;
  remainder := n % p_pool_count;

  create temp table if not exists _gs_pool_state (
    pool_no int primary key,
    capacity int not null,
    filled int not null default 0
  ) on commit drop;
  delete from _gs_pool_state;

  for p in 1..p_pool_count loop
    insert into _gs_pool_state (pool_no, capacity, filled)
    values (p, base_size + (case when p <= remainder then 1 else 0 end), 0);
  end loop;

  create temp table if not exists _gs_pool_clubs (
    pool_no int not null,
    club_key text not null
  ) on commit drop;
  delete from _gs_pool_clubs;

  create temp table if not exists _gs_players (
    user_id uuid primary key,
    club_key text not null,
    club_size int not null,
    seed int
  ) on commit drop;
  delete from _gs_players;

  insert into _gs_players (user_id, club_key, club_size, seed)
  select
    tp.user_id,
    ck.club_key,
    count(*) over (partition by ck.club_key),
    tp.seed
  from public.tournament_players tp
  join public.profiles pr on pr.id = tp.user_id
  cross join lateral (
    select coalesce(nullif(lower(trim(split_part(pr.display_name, ' ', 1))), ''), 'solo_' || tp.user_id::text) as club_key
  ) ck
  where tp.tournament_id = tid and tp.status = 'joined';

  update public.tournament_players
  set pool_no = null
  where tournament_id = tid;

  -- Place the largest club groups first (hardest to spread out), largest-to-smallest.
  for r in
    select * from _gs_players
    order by club_size desc, club_key, coalesce(seed, 999999), user_id
  loop
    select ps.pool_no into chosen_pool
    from _gs_pool_state ps
    where ps.filled < ps.capacity
      and not exists (
        select 1 from _gs_pool_clubs pc
        where pc.pool_no = ps.pool_no and pc.club_key = r.club_key
      )
    order by ps.filled asc, ps.pool_no asc
    limit 1;

    if chosen_pool is null then
      -- No conflict-free pool left: accept a same-club pairing, pick the openest pool.
      select ps.pool_no into chosen_pool
      from _gs_pool_state ps
      where ps.filled < ps.capacity
      order by ps.filled asc, ps.pool_no asc
      limit 1;
    end if;

    if chosen_pool is null then
      raise exception 'pool_assignment_failed';
    end if;

    update _gs_pool_state set filled = filled + 1 where pool_no = chosen_pool;
    insert into _gs_pool_clubs (pool_no, club_key) values (chosen_pool, r.club_key);
    update public.tournament_players
    set pool_no = chosen_pool
    where tournament_id = tid and user_id = r.user_id;
  end loop;
end $$;

-- Builds the full round-robin schedule for each of the 8 pools (circle
-- method, same algorithm as create_beylive_partner_league_matches). Pools
-- with 4 players play 3 rounds; a 5-player pool plays 5 rounds with one
-- player resting each round. match_no/table_no run as one counter across
-- every pool so no two pools share a table number.
create or replace function public.create_beylive_group_stage_matches(tid uuid, p_target_score int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  p int;
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
  for p in 1..8 loop
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
    perform public.create_beylive_partner_league_matches(tid, effective_target);
    return;
  end if;

  if t.format = 'group_stage' then
    perform public.assign_group_stage_pools(tid, 8);
    perform public.create_beylive_group_stage_matches(tid, effective_target);
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
  next_match_no int := 1;
  group_size int;
  players uuid[];
  champion_id uuid;
  champion_team_id uuid;
  gs_slots int[] := array[1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11];
  gs_idx int;
  gs_a int;
  gs_b int;
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
    next_round := cur + 1;

    if exists (
      select 1 from public.beylive_matches
      where tournament_id = tid and round_no = next_round
    ) then
      update public.tournaments set current_round = next_round where id = tid;
      return;
    end if;

    if exists (
      select 1 from public.beylive_matches
      where tournament_id = tid and round_no = cur and bracket = 'main'
    ) then
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
        left join public.beylive_matches bm on bm.id = bmp.match_id and bm.tournament_id = tid and bm.bracket = 'main'
        left join lateral (
          select coalesce(sum(x.score), 0) as total_score
          from public.beylive_match_players x
          where x.match_id = bm.id
        ) mt on true
        where bt.tournament_id = tid
        group by bt.id, bt.seed, bt.team_no
      ) ranked;

      n := coalesce(array_length(team_ids, 1), 0);
      if n <= 2 then
        champion_team_id := case when n >= 1 then team_ids[1] else t.winner_team_id end;
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

      declare
        top_count int := ceil(n::numeric / 2)::int;
        right_idx int;
        created_count int := 0;
      begin
        i := 1;
        right_idx := top_count;
        while i <= right_idx loop
          if i = right_idx then
            perform public.create_beylive_team_match(tid, next_round, 'grand', next_match_no, next_match_no, t.target_score, array[team_ids[i]]);
          else
            perform public.create_beylive_team_match(tid, next_round, 'grand', next_match_no, next_match_no, t.target_score, array[team_ids[i], team_ids[right_idx]]);
          end if;
          next_match_no := next_match_no + 1;
          created_count := created_count + 1;
          i := i + 1;
          right_idx := right_idx - 1;
        end loop;

        if n - top_count >= 2 then
          i := top_count + 1;
          right_idx := n;
          while i <= right_idx loop
            if i = right_idx then
              perform public.create_beylive_team_match(tid, next_round, 'losers', next_match_no, next_match_no, t.target_score, array[team_ids[i]]);
            else
              perform public.create_beylive_team_match(tid, next_round, 'losers', next_match_no, next_match_no, t.target_score, array[team_ids[i], team_ids[right_idx]]);
            end if;
            next_match_no := next_match_no + 1;
            created_count := created_count + 1;
            i := i + 1;
            right_idx := right_idx - 1;
          end loop;
        end if;

        if created_count > 0 then
          update public.tournaments set current_round = next_round where id = tid;
          return;
        end if;
      end;
    end if;

    declare
      grand_winners uuid[];
      consolation_winners uuid[];
      created_count int := 0;
    begin
      select array_agg(winner_team_id order by match_no)
      into grand_winners
      from public.beylive_matches
      where tournament_id = tid
        and round_no = cur
        and bracket = 'grand'
        and status = 'completed'
        and winner_team_id is not null;

      select array_agg(winner_team_id order by match_no)
      into consolation_winners
      from public.beylive_matches
      where tournament_id = tid
        and round_no = cur
        and bracket = 'losers'
        and status = 'completed'
        and winner_team_id is not null;

      n := coalesce(array_length(grand_winners, 1), 0);
      if n > 1 then
        i := 1;
        while i <= n loop
          if i = n then
            perform public.create_beylive_team_match(tid, next_round, 'grand', next_match_no, next_match_no, t.target_score, array[grand_winners[i]]);
          else
            perform public.create_beylive_team_match(tid, next_round, 'grand', next_match_no, next_match_no, t.target_score, array[grand_winners[i], grand_winners[i + 1]]);
          end if;
          next_match_no := next_match_no + 1;
          created_count := created_count + 1;
          i := i + 2;
        end loop;
      end if;

      n := coalesce(array_length(consolation_winners, 1), 0);
      if n > 1 then
        i := 1;
        while i <= n loop
          if i = n then
            perform public.create_beylive_team_match(tid, next_round, 'losers', next_match_no, next_match_no, t.target_score, array[consolation_winners[i]]);
          else
            perform public.create_beylive_team_match(tid, next_round, 'losers', next_match_no, next_match_no, t.target_score, array[consolation_winners[i], consolation_winners[i + 1]]);
          end if;
          next_match_no := next_match_no + 1;
          created_count := created_count + 1;
          i := i + 2;
        end loop;
      end if;

      if created_count > 0 then
        update public.tournaments set current_round = next_round where id = tid;
        return;
      end if;
    end;

    select winner_team_id into champion_team_id
    from public.beylive_matches
    where tournament_id = tid
      and bracket = 'grand'
      and status = 'completed'
      and winner_team_id is not null
    order by round_no desc, match_no desc
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

  if t.format = 'group_stage' then
    if not exists (
      select 1 from public.beylive_matches
      where tournament_id = tid and bracket = 'main'
    ) then
      next_round := cur + 1;

      if exists (
        select 1 from public.beylive_matches
        where tournament_id = tid and round_no = next_round and bracket ~ '^pool_[1-8]$'
      ) then
        update public.tournaments set current_round = next_round where id = tid;
        return;
      end if;

      -- Every pool has finished its round robin: rank each pool and seed the
      -- top 2 (winners, then runners-up) into a knockout bracket, using the
      -- standard 16-slot seeding so a pool's winner never opens against its
      -- own runner-up.
      create temp table if not exists _gs_standings (
        pool_no int,
        user_id uuid,
        wins int,
        points int,
        pool_rank int
      ) on commit drop;
      delete from _gs_standings;

      insert into _gs_standings (pool_no, user_id, wins, points)
      select
        tp.pool_no,
        tp.user_id,
        coalesce(sum(case when bm.status = 'completed' and mp.result = 'win' then 1 else 0 end), 0),
        coalesce(sum(case when bm.status = 'completed' then mp.score else 0 end), 0)
      from public.tournament_players tp
      left join public.beylive_matches bm
        on bm.tournament_id = tid and bm.bracket = 'pool_' || tp.pool_no
      left join public.beylive_match_players mp
        on mp.match_id = bm.id and mp.user_id = tp.user_id
      where tp.tournament_id = tid and tp.status = 'joined' and tp.pool_no is not null
      group by tp.pool_no, tp.user_id;

      update _gs_standings s
      set pool_rank = ranked.pool_rank
      from (
        select user_id, row_number() over (
          partition by pool_no order by wins desc, points desc, user_id
        ) as pool_rank
        from _gs_standings
      ) ranked
      where ranked.user_id = s.user_id;

      select array_agg(user_id order by seed_order)
      into ids
      from (
        select user_id, row_number() over (order by pool_rank, pool_no) as seed_order
        from _gs_standings
        where pool_rank <= 2
      ) seeded;

      n := coalesce(array_length(ids, 1), 0);
      if n = 0 then
        return;
      end if;

      next_match_no := 1;
      gs_idx := 1;
      while gs_idx <= array_length(gs_slots, 1) loop
        gs_a := gs_slots[gs_idx];
        gs_b := gs_slots[gs_idx + 1];
        if gs_a <= n and gs_b <= n then
          perform public.create_beylive_match(tid, next_round, 'main', next_match_no, next_match_no, t.target_score, array[ids[gs_a], ids[gs_b]]);
          next_match_no := next_match_no + 1;
        elsif gs_a <= n then
          perform public.create_beylive_match(tid, next_round, 'main', next_match_no, next_match_no, t.target_score, array[ids[gs_a]]);
          next_match_no := next_match_no + 1;
        elsif gs_b <= n then
          perform public.create_beylive_match(tid, next_round, 'main', next_match_no, next_match_no, t.target_score, array[ids[gs_b]]);
          next_match_no := next_match_no + 1;
        end if;
        gs_idx := gs_idx + 2;
      end loop;

      update public.tournaments set current_round = next_round where id = tid;
      return;
    end if;
    -- A 'main' bracket already exists: the group stage is done, fall through
    -- to the generic single-elimination pairwise-halving logic below.
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
    elsif main_count = 1 and pool_count > 1 then
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
      perform public.create_beylive_match(tid, next_round, 'main', next_match_no, next_match_no, t.target_score, players);
      next_match_no := next_match_no + 1;
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
        next_match_no,
        next_match_no,
        t.target_score,
        players
      );
      next_match_no := next_match_no + 1;
      i := i + 2;
    end loop;
  end if;

  update public.tournaments set current_round = next_round where id = tid;
end $$;

revoke execute on function public.assign_group_stage_pools(uuid, int) from public;
revoke execute on function public.create_beylive_group_stage_matches(uuid, int) from public;
