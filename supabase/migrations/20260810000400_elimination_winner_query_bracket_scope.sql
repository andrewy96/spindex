-- After a group_stage tournament's Top 16 ('main' bracket, first round) is
-- seeded, its round_no is just tournament.current_round + 1 at the time —
-- there is nothing stopping that number from colliding with a pool round's
-- round_no, since pool rounds already occupy 1..N. In practice the very
-- first Top 16 generation reused round_no 2, the same round_no as every
-- pool's "Round 2" matches.
--
-- The generic single-elimination progression (the `else` branch that picks
-- winners to pair into the next round) selected winner_id from ALL matches
-- with round_no = cur, with no bracket filter. Once Round of 16 finished,
-- advancing pulled in not just the 8 'main' bracket winners but also every
-- completed pool_* match sharing that same round_no — producing a "Round of
-- 24" (or worse) instead of Top 8.
--
-- Fix: scope that query to bracket = 'main'. Every format that reaches this
-- branch (group_stage post-seeding, free_for_all, default single
-- elimination) only ever creates its own matches with bracket = 'main', so
-- this filter is a strict correctness fix with no behavior change for
-- tournaments that never had a round_no collision.

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
        where tournament_id = tid and bracket ~ '^pool_[1-8]$'
          and status not in ('completed', 'cancelled')
      ) then
        update public.tournaments set current_round = next_round where id = tid;
        return;
      end if;

      -- Every pool has finished its round robin: rank each pool and seed the
      -- top 2 (winners, then runners-up) into a knockout bracket, using the
      -- standard 16-slot seeding so a pool's winner never opens against its
      -- own runner-up. Tiebreak order mirrors beyliveGroupPools() in
      -- src/lib/beylive.ts exactly: wins, then score difference, then total
      -- points scored, then fewer losses, then draw seed.
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
      and bracket = 'main'
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
