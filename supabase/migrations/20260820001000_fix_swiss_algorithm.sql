-- Fix Swiss tournament pairing.
--
-- The legacy Swiss path paired adjacent seeds in round 1 and then simply
-- paired the standings list each round, which caused avoidable rematches and
-- weak tiebreaking. This adds a proper Swiss pairing path:
--   - round 1 pairs top half vs bottom half by seed
--   - later rounds pair nearby records while avoiding rematches where possible
--   - odd-player byes go to the lowest-ranked player with the fewest byes
--   - final standings use wins, score difference, points, losses, seed

create or replace function public.beylive_swiss_round_limit(p_player_count int)
returns int
language sql
immutable
set search_path = public
as $$
  select greatest(1, ceiling(ln(greatest(2, p_player_count)) / ln(2))::int);
$$;

create or replace function public.create_beylive_swiss_round(
  tid uuid,
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
begin
  create temp table if not exists _swiss_queue (
    user_id uuid primary key,
    seed int,
    wins int not null,
    losses int not null,
    points int not null,
    against int not null,
    diff int not null,
    bye_count int not null
  ) on commit drop;
  delete from _swiss_queue where true;

  insert into _swiss_queue (user_id, seed, wins, losses, points, against, diff, bye_count)
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
    coalesce(sum(case when bm.status = 'completed' and mp.user_id is not null and mt.player_count = 1 then 1 else 0 end), 0)::int as bye_count
  from public.tournament_players tp
  left join public.beylive_matches bm
    on bm.tournament_id = tid
    and bm.bracket = 'main'
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
  group by tp.user_id, tp.seed;

  select count(*) into player_count from _swiss_queue;
  if player_count < 2 then
    return;
  end if;

  if player_count % 2 = 1 then
    select user_id
    into bye_id
    from _swiss_queue
    order by bye_count asc, wins asc, diff asc, points asc, losses desc, seed desc nulls last, user_id desc
    limit 1;

    delete from _swiss_queue where user_id = bye_id;
    player_count := player_count - 1;
  end if;

  if p_round_no <= 1 then
    select array_agg(user_id order by seed nulls last, user_id)
    into seeded_ids
    from _swiss_queue;

    half_count := player_count / 2;
    i := 1;
    while i <= half_count loop
      perform public.create_beylive_match(
        tid,
        p_round_no,
        'main',
        match_no,
        match_no,
        p_target_score,
        array[seeded_ids[i], seeded_ids[i + half_count]]
      );
      match_no := match_no + 1;
      i := i + 1;
    end loop;
  else
    while exists (select 1 from _swiss_queue) loop
      select *
      into a_rec
      from _swiss_queue
      order by wins desc, diff desc, points desc, losses asc, seed nulls last, user_id
      limit 1;

      select q.user_id
      into b_id
      from _swiss_queue q
      where q.user_id <> a_rec.user_id
      order by
        case when exists (
          select 1
          from public.beylive_matches bm
          join public.beylive_match_players a on a.match_id = bm.id and a.user_id = a_rec.user_id
          join public.beylive_match_players b on b.match_id = bm.id and b.user_id = q.user_id
          where bm.tournament_id = tid
            and bm.bracket = 'main'
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

      if b_id is null then
        perform public.create_beylive_match(
          tid,
          p_round_no,
          'main',
          match_no,
          match_no,
          p_target_score,
          array[a_rec.user_id]
        );
        delete from _swiss_queue where user_id = a_rec.user_id;
      else
        perform public.create_beylive_match(
          tid,
          p_round_no,
          'main',
          match_no,
          match_no,
          p_target_score,
          array[a_rec.user_id, b_id]
        );
        delete from _swiss_queue where user_id in (a_rec.user_id, b_id);
      end if;

      match_no := match_no + 1;
      b_id := null;
    end loop;
  end if;

  if bye_id is not null then
    perform public.create_beylive_match(
      tid,
      p_round_no,
      'main',
      match_no,
      match_no,
      p_target_score,
      array[bye_id]
    );
  end if;
end;
$$;

create or replace function public.advance_beylive_swiss_round(tid uuid)
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
  round_limit int;
  champion_id uuid;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;

  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.format <> 'swiss' then
    perform public.advance_beylive_round_double_20260820(tid);
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

  select count(*) into player_count
  from public.tournament_players
  where tournament_id = tid
    and status = 'joined';

  round_limit := public.beylive_swiss_round_limit(player_count);

  if cur >= round_limit then
    select user_id
    into champion_id
    from (
      select
        tp.user_id,
        tp.seed,
        coalesce(sum(case when bm.status = 'completed' and mp.result = 'win' then 1 else 0 end), 0)::int as wins,
        coalesce(sum(case when bm.status = 'completed' and mp.result = 'loss' then 1 else 0 end), 0)::int as losses,
        coalesce(sum(case when bm.status = 'completed' then mp.score else 0 end), 0)::int as points,
        (
          coalesce(sum(case when bm.status = 'completed' then mp.score else 0 end), 0)
            - coalesce(sum(case when bm.status = 'completed' then mt.total_score - mp.score else 0 end), 0)
        )::int as diff
      from public.tournament_players tp
      left join public.beylive_matches bm
        on bm.tournament_id = tid
        and bm.bracket = 'main'
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
      group by tp.user_id, tp.seed
    ) ranked
    order by wins desc, diff desc, points desc, losses asc, seed nulls last, user_id
    limit 1;

    update public.tournaments
    set status = 'completed',
        live_enabled = false,
        winner_id = champion_id,
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

  perform public.create_beylive_swiss_round(tid, next_round, t.target_score);
  update public.tournaments set current_round = next_round where id = tid;
end;
$$;

alter function public.start_beylive(uuid) rename to start_beylive_knockout_20260820;
alter function public.advance_beylive_round(uuid) rename to advance_beylive_round_double_20260820;

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
  effective_target int;
begin
  select * into t from public.tournaments where id = tid for update;

  if t is null or t.format <> 'swiss' then
    perform public.start_beylive_knockout_20260820(tid);
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

  perform public.create_beylive_swiss_round(tid, 1, effective_target);
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
    perform public.advance_beylive_swiss_round(tid);
  else
    perform public.advance_beylive_round_double_20260820(tid);
  end if;
end;
$$;

revoke all on function public.beylive_swiss_round_limit(int) from public;
revoke all on function public.beylive_swiss_round_limit(int) from anon;
revoke all on function public.beylive_swiss_round_limit(int) from authenticated;
revoke all on function public.create_beylive_swiss_round(uuid, int, int) from public;
revoke all on function public.create_beylive_swiss_round(uuid, int, int) from anon;
revoke all on function public.create_beylive_swiss_round(uuid, int, int) from authenticated;
revoke all on function public.advance_beylive_swiss_round(uuid) from public;
revoke all on function public.advance_beylive_swiss_round(uuid) from anon;
revoke all on function public.advance_beylive_swiss_round(uuid) from authenticated;
revoke all on function public.start_beylive_knockout_20260820(uuid) from public;
revoke all on function public.start_beylive_knockout_20260820(uuid) from anon;
revoke all on function public.start_beylive_knockout_20260820(uuid) from authenticated;
revoke all on function public.advance_beylive_round_double_20260820(uuid) from public;
revoke all on function public.advance_beylive_round_double_20260820(uuid) from anon;
revoke all on function public.advance_beylive_round_double_20260820(uuid) from authenticated;

grant execute on function public.beylive_swiss_round_limit(int) to service_role;
grant execute on function public.create_beylive_swiss_round(uuid, int, int) to service_role;
grant execute on function public.advance_beylive_swiss_round(uuid) to service_role;
grant execute on function public.start_beylive_knockout_20260820(uuid) to service_role;
grant execute on function public.advance_beylive_round_double_20260820(uuid) to service_role;

revoke execute on function public.start_beylive(uuid) from public;
revoke execute on function public.advance_beylive_round(uuid) from public;
grant execute on function public.start_beylive(uuid) to authenticated;
grant execute on function public.advance_beylive_round(uuid) to authenticated;
