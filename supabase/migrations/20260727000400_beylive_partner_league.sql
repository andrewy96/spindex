-- BEYLIVE partner/team-battle mode now runs as League by default:
-- full round-robin first, then championship and consolation playoffs.

create or replace function public.create_beylive_partner_league_matches(
  tid uuid,
  p_target_score int
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  team_ids uuid[];
  ring uuid[];
  team_count int;
  ring_count int;
  round_no int;
  pair_no int;
  left_team uuid;
  right_team uuid;
  last_team uuid;
  k int;
begin
  select array_agg(bt.id order by coalesce(bt.seed, bt.team_no), bt.team_no)
  into team_ids
  from public.beylive_teams bt
  where bt.tournament_id = tid;

  team_count := coalesce(array_length(team_ids, 1), 0);
  if team_count < 2 then raise exception 'not_enough_teams'; end if;

  ring := team_ids;
  if team_count % 2 = 1 then
    ring := ring || null::uuid;
  end if;

  ring_count := array_length(ring, 1);

  for round_no in 1..(ring_count - 1) loop
    pair_no := 1;
    for k in 1..(ring_count / 2) loop
      left_team := ring[k];
      right_team := ring[ring_count + 1 - k];

      if left_team is not null and right_team is not null then
        perform public.create_beylive_team_match(
          tid,
          round_no,
          'main',
          pair_no,
          pair_no,
          p_target_score,
          array[left_team, right_team]
        );
        pair_no := pair_no + 1;
      end if;
    end loop;

    last_team := ring[ring_count];
    if ring_count > 2 then
      for k in reverse ring_count..3 loop
        ring[k] := ring[k - 1];
      end loop;
    end if;
    ring[2] := last_team;
  end loop;
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
  right_idx int;
  match_no int := 1;
  group_size int;
  players uuid[];
  champion_id uuid;
  champion_team_id uuid;
  top_count int;
  created_count int := 0;
  grand_winners uuid[];
  consolation_winners uuid[];
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

      top_count := ceil(n::numeric / 2)::int;

      i := 1;
      right_idx := top_count;
      while i <= right_idx loop
        if i = right_idx then
          perform public.create_beylive_team_match(tid, next_round, 'grand', match_no, match_no, t.target_score, array[team_ids[i]]);
        else
          perform public.create_beylive_team_match(tid, next_round, 'grand', match_no, match_no, t.target_score, array[team_ids[i], team_ids[right_idx]]);
        end if;
        match_no := match_no + 1;
        created_count := created_count + 1;
        i := i + 1;
        right_idx := right_idx - 1;
      end loop;

      if n - top_count >= 2 then
        i := top_count + 1;
        right_idx := n;
        while i <= right_idx loop
          if i = right_idx then
            perform public.create_beylive_team_match(tid, next_round, 'losers', match_no, match_no, t.target_score, array[team_ids[i]]);
          else
            perform public.create_beylive_team_match(tid, next_round, 'losers', match_no, match_no, t.target_score, array[team_ids[i], team_ids[right_idx]]);
          end if;
          match_no := match_no + 1;
          created_count := created_count + 1;
          i := i + 1;
          right_idx := right_idx - 1;
        end loop;
      end if;

      if created_count > 0 then
        update public.tournaments set current_round = next_round where id = tid;
        return;
      end if;
    end if;

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
          perform public.create_beylive_team_match(tid, next_round, 'grand', match_no, match_no, t.target_score, array[grand_winners[i]]);
        else
          perform public.create_beylive_team_match(tid, next_round, 'grand', match_no, match_no, t.target_score, array[grand_winners[i], grand_winners[i + 1]]);
        end if;
        match_no := match_no + 1;
        created_count := created_count + 1;
        i := i + 2;
      end loop;
    end if;

    n := coalesce(array_length(consolation_winners, 1), 0);
    if n > 1 then
      i := 1;
      while i <= n loop
        if i = n then
          perform public.create_beylive_team_match(tid, next_round, 'losers', match_no, match_no, t.target_score, array[consolation_winners[i]]);
        else
          perform public.create_beylive_team_match(tid, next_round, 'losers', match_no, match_no, t.target_score, array[consolation_winners[i], consolation_winners[i + 1]]);
        end if;
        match_no := match_no + 1;
        created_count := created_count + 1;
        i := i + 2;
      end loop;
    end if;

    if created_count > 0 then
      update public.tournaments set current_round = next_round where id = tid;
      return;
    end if;

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

revoke execute on function public.create_beylive_partner_league_matches(uuid, int) from public;
