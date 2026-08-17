-- A one-player main-bracket row is an auto-advance bye. The previous
-- third-place trigger could fire while a round was still being inserted,
-- mistaking the first visible match of a 3-player round for the Final.

create or replace function public.ensure_beylive_third_place_match()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m public.beylive_matches;
  tournament_format text;
  current_main_count int;
  current_player_count int;
  previous_round int;
  previous_winner_count int;
  previous_main_count int;
  semifinal_losers uuid[];
begin
  select * into m from public.beylive_matches where id = new.match_id;
  if m is null or m.bracket <> 'main' then return new; end if;

  select format into tournament_format from public.tournaments where id = m.tournament_id;
  if tournament_format not in ('single_elimination', 'group_stage') then return new; end if;

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
end $$;

-- Remove third-place matches that were created in a round that is not the
-- Final round. Legitimate 3rd-place matches share a round with exactly one
-- main-bracket match: the Final.
delete from public.beylive_matches bm
using public.tournaments t
where t.id = bm.tournament_id
  and t.format in ('single_elimination', 'group_stage')
  and bm.bracket = 'losers'
  and exists (
    select 1
    from public.beylive_matches main
    where main.tournament_id = bm.tournament_id
      and main.round_no = bm.round_no
      and main.bracket = 'main'
  )
  and (
    select count(*)
    from public.beylive_matches main
    where main.tournament_id = bm.tournament_id
      and main.round_no = bm.round_no
      and main.bracket = 'main'
  ) <> 1;

-- Completed tournaments no longer need their hidden auto-advance rows for
-- future advancement. Removing them cleans up already-finished live views.
delete from public.beylive_matches bm
using public.tournaments t
where t.id = bm.tournament_id
  and t.status = 'completed'
  and t.format in ('single_elimination', 'group_stage')
  and bm.bracket = 'main'
  and not exists (
    select 1
    from public.beylive_match_rounds rounds
    where rounds.match_id = bm.id
  )
  and (
    select count(*)
    from public.beylive_match_players mp
    where mp.match_id = bm.id
  ) < 2;
