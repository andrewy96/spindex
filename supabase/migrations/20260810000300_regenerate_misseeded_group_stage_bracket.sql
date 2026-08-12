-- One-off data correction for the specific live group_stage tournament whose
-- Round of 16 was seeded by the buggy tiebreak in advance_beylive_round
-- (fixed in 20260810000200_group_stage_seed_score_diff_tiebreak.sql): a pool
-- standings tie on wins was broken by total points instead of score
-- difference, which put AZAMUDDIN (Pool 8, rank 3-4, tied 1-2) into the
-- bracket instead of the correct runner-up, SSC Alwin.
--
-- This targets only the tournament whose 'main' bracket contains a match
-- between "Chee Hian" and "AZAMUDDIN" (the exact pairing reported as wrong),
-- and only proceeds if that bracket is still in its very first round (no
-- Top 8 / Semifinal 4 has been generated on top of it yet) — so this cannot
-- accidentally wipe a bracket that has already progressed further. Any match
-- already played and completed at Round of 16 (e.g. Chee Hian's win) is
-- voided along with the rest, since the identity of the correct opponent
-- changes what "won" even means.
do $$
declare
  affected_tid uuid;
  t public.tournaments;
  ids uuid[];
  n int;
  next_round int;
  next_match_no int := 1;
  gs_slots int[] := array[1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11];
  gs_idx int;
  gs_a int;
  gs_b int;
begin
  select bm.tournament_id into affected_tid
  from public.beylive_matches bm
  join public.beylive_match_players mp1 on mp1.match_id = bm.id
  join public.profiles p1 on p1.id = mp1.user_id and p1.display_name = 'Chee Hian'
  join public.beylive_match_players mp2 on mp2.match_id = bm.id
  join public.profiles p2 on p2.id = mp2.user_id and p2.display_name = 'AZAMUDDIN'
  join public.tournaments tt on tt.id = bm.tournament_id and tt.status <> 'completed' and tt.format = 'group_stage'
  where bm.bracket = 'main'
  limit 1;

  if affected_tid is null then
    raise notice 'No matching mis-seeded tournament found; nothing to do.';
    return;
  end if;

  if (
    select count(distinct round_no) from public.beylive_matches
    where tournament_id = affected_tid and bracket = 'main'
  ) > 1 then
    raise exception 'main bracket for tournament % has already advanced past its first round; refusing to auto-regenerate', affected_tid;
  end if;

  select * into t from public.tournaments where id = affected_tid for update;

  select round_no into next_round
  from public.beylive_matches
  where tournament_id = affected_tid and bracket = 'main'
  limit 1;

  delete from public.beylive_matches
  where tournament_id = affected_tid and bracket = 'main';

  create temp table if not exists _fix_gs_standings (
    pool_no int,
    user_id uuid,
    seed int,
    wins int,
    losses int,
    points int,
    against int,
    pool_rank int
  ) on commit drop;
  delete from _fix_gs_standings where true;

  insert into _fix_gs_standings (pool_no, user_id, seed, wins, losses, points, against)
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
    on bm.tournament_id = affected_tid and bm.bracket = 'pool_' || tp.pool_no
  left join public.beylive_match_players mp
    on mp.match_id = bm.id and mp.user_id = tp.user_id
  left join lateral (
    select coalesce(sum(x.score), 0) as total_score
    from public.beylive_match_players x
    where x.match_id = bm.id
  ) mt on true
  where tp.tournament_id = affected_tid and tp.status = 'joined' and tp.pool_no is not null
  group by tp.pool_no, tp.user_id, tp.seed;

  update _fix_gs_standings s
  set pool_rank = ranked.pool_rank
  from (
    select user_id, row_number() over (
      partition by pool_no
      order by wins desc, (points - against) desc, points desc, losses asc, seed nulls last, user_id
    ) as pool_rank
    from _fix_gs_standings
  ) ranked
  where ranked.user_id = s.user_id;

  select array_agg(user_id order by seed_order)
  into ids
  from (
    select user_id, row_number() over (order by pool_rank, pool_no) as seed_order
    from _fix_gs_standings
    where pool_rank <= 2
  ) seeded;

  n := coalesce(array_length(ids, 1), 0);
  if n = 0 then
    raise exception 'no seeded players found for tournament %; aborting before leaving bracket empty', affected_tid;
  end if;

  gs_idx := 1;
  while gs_idx <= array_length(gs_slots, 1) loop
    gs_a := gs_slots[gs_idx];
    gs_b := gs_slots[gs_idx + 1];
    if gs_a <= n and gs_b <= n then
      perform public.create_beylive_match(affected_tid, next_round, 'main', next_match_no, next_match_no, t.target_score, array[ids[gs_a], ids[gs_b]]);
      next_match_no := next_match_no + 1;
    elsif gs_a <= n then
      perform public.create_beylive_match(affected_tid, next_round, 'main', next_match_no, next_match_no, t.target_score, array[ids[gs_a]]);
      next_match_no := next_match_no + 1;
    elsif gs_b <= n then
      perform public.create_beylive_match(affected_tid, next_round, 'main', next_match_no, next_match_no, t.target_score, array[ids[gs_b]]);
      next_match_no := next_match_no + 1;
    end if;
    gs_idx := gs_idx + 2;
  end loop;

  raise notice 'Regenerated Round of 16 for tournament % with corrected score-diff tiebreak seeding.', affected_tid;
end $$;
