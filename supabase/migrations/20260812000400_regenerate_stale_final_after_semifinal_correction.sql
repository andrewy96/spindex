-- Data correction for the specific live tournament whose Final was still
-- showing SSC Alwin (3-7 loser of the Semifinal to Johnny) paired against
-- jordan, instead of the actual semifinal winners (Johnny and jordan). This
-- is leftover bad data from before 20260812000200_undo_point_clears_stale_next_round.sql
-- was deployed -- whatever correction happened to the semifinal predates the
-- fix that would have cleared this stale Final automatically.
do $$
declare
  affected_tid uuid;
  final_round_no int;
  final_match_id uuid;
  semi_round_no int;
  t public.tournaments;
  ids uuid[];
  n int;
begin
  select bm.tournament_id, bm.round_no, bm.id
  into affected_tid, final_round_no, final_match_id
  from public.beylive_matches bm
  join public.beylive_match_players mp1 on mp1.match_id = bm.id
  join public.profiles p1 on p1.id = mp1.user_id and p1.display_name = 'SSC Alwin'
  join public.beylive_match_players mp2 on mp2.match_id = bm.id
  join public.profiles p2 on p2.id = mp2.user_id and p2.display_name = 'jordan'
  join public.tournaments tt on tt.id = bm.tournament_id and tt.status <> 'completed' and tt.format = 'group_stage'
  where bm.bracket = 'main' and bm.status <> 'completed'
  limit 1;

  if affected_tid is null then
    raise notice 'No matching stale Final found; nothing to do.';
    return;
  end if;

  if exists (select 1 from public.beylive_match_rounds where match_id = final_match_id) then
    raise exception 'Final match % already has recorded points; refusing to auto-fix', final_match_id;
  end if;

  select * into t from public.tournaments where id = affected_tid for update;

  select max(round_no) into semi_round_no
  from public.beylive_matches
  where tournament_id = affected_tid and bracket = 'main' and round_no < final_round_no;

  select array_agg(winner_id order by match_no)
  into ids
  from public.beylive_matches
  where tournament_id = affected_tid
    and round_no = semi_round_no
    and bracket = 'main'
    and status = 'completed'
    and winner_id is not null;

  n := coalesce(array_length(ids, 1), 0);
  if n <> 2 then
    raise exception 'expected exactly 2 semifinal winners for tournament %, found %', affected_tid, n;
  end if;

  delete from public.beylive_matches where id = final_match_id;

  perform public.create_beylive_match(affected_tid, final_round_no, 'main', 1, 1, 7, ids);

  raise notice 'Regenerated Final for tournament % with correct semifinal winners.', affected_tid;
end $$;
