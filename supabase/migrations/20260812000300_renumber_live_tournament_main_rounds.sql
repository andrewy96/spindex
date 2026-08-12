-- Data correction paired with 20260812000100_group_stage_bracket_round_no_collision_fix.sql:
-- this specific live tournament's 'main' bracket (Round of 16 through Final)
-- was already seeded with round_no values that collide with its pool
-- rounds (1..N), which is what made the entire knockout bracket disappear
-- into "Group stage · Round N" sections on the public live/spectator view.
--
-- This shifts every existing 'main' bracket round_no up by the tournament's
-- pool-round count, moving them clear of every pool round_no while
-- preserving their relative order (Round of 16 < Top 8 < Semifinal < Final).
-- Identified by the Final matchup (SSC Alwin vs jordan) reported as missing
-- from the live view.
do $$
declare
  affected_tid uuid;
  offset_amount int;
  old_current_round int;
  is_main_round boolean;
begin
  select bm.tournament_id into affected_tid
  from public.beylive_matches bm
  join public.beylive_match_players mp1 on mp1.match_id = bm.id
  join public.profiles p1 on p1.id = mp1.user_id and p1.display_name = 'SSC Alwin'
  join public.beylive_match_players mp2 on mp2.match_id = bm.id
  join public.profiles p2 on p2.id = mp2.user_id and p2.display_name = 'jordan'
  join public.tournaments tt on tt.id = bm.tournament_id and tt.format = 'group_stage'
  where bm.bracket = 'main'
  limit 1;

  if affected_tid is null then
    raise notice 'No matching tournament found; nothing to do.';
    return;
  end if;

  select coalesce(max(round_no), 0) into offset_amount
  from public.beylive_matches
  where tournament_id = affected_tid and bracket ~ '^pool_[1-8]$';

  if offset_amount = 0 then
    raise notice 'No pool rounds found for tournament %; nothing to renumber.', affected_tid;
    return;
  end if;

  select current_round into old_current_round
  from public.tournaments where id = affected_tid for update;

  select exists (
    select 1 from public.beylive_matches
    where tournament_id = affected_tid and bracket = 'main' and round_no = old_current_round
  ) into is_main_round;

  update public.beylive_matches
  set round_no = round_no + offset_amount
  where tournament_id = affected_tid and bracket = 'main';

  if is_main_round then
    update public.tournaments
    set current_round = old_current_round + offset_amount
    where id = affected_tid;
  end if;

  raise notice 'Renumbered main-bracket rounds for tournament % by +% (current_round adjusted: %).', affected_tid, offset_amount, is_main_round;
end $$;
