-- Individual knockout tournaments should decide 3rd and 4th place instead of
-- treating both semifinal losers as tied bronze. When the Final match is
-- generated from two completed Semifinals, create a same-round losers-bracket
-- match between the semifinal losers.

create or replace function public.ensure_beylive_third_place_match()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m public.beylive_matches;
  tournament_format text;
  current_main_count int;
  current_player_count int;
  previous_round int;
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

drop trigger if exists beylive_third_place_after_player_insert on public.beylive_match_players;
create trigger beylive_third_place_after_player_insert
  after insert on public.beylive_match_players
  for each row execute function public.ensure_beylive_third_place_match();

-- If a live tournament already has its Final generated before this migration,
-- add the missing 3rd-place match without touching completed tournaments.
do $$
declare
  final_match public.beylive_matches;
  previous_round int;
  previous_main_count int;
  semifinal_losers uuid[];
begin
  for final_match in
    select bm.*
    from public.beylive_matches bm
    join public.tournaments t on t.id = bm.tournament_id
    where t.status <> 'completed'
      and t.format in ('single_elimination', 'group_stage')
      and bm.bracket = 'main'
      and (
        select count(*)
        from public.beylive_matches x
        where x.tournament_id = bm.tournament_id
          and x.round_no = bm.round_no
          and x.bracket = 'main'
      ) = 1
      and (
        select count(*)
        from public.beylive_match_players mp
        where mp.match_id = bm.id
      ) = 2
      and not exists (
        select 1
        from public.beylive_matches x
        where x.tournament_id = bm.tournament_id
          and x.round_no = bm.round_no
          and x.bracket = 'losers'
      )
  loop
    select max(round_no) into previous_round
    from public.beylive_matches
    where tournament_id = final_match.tournament_id
      and bracket = 'main'
      and round_no < final_match.round_no;

    if previous_round is null then continue; end if;

    select count(*) into previous_main_count
    from public.beylive_matches bm
    where bm.tournament_id = final_match.tournament_id
      and bm.round_no = previous_round
      and bm.bracket = 'main'
      and bm.status = 'completed'
      and bm.winner_id is not null
      and (
        select count(*)
        from public.beylive_match_players mp
        where mp.match_id = bm.id
      ) = 2;

    if previous_main_count <> 2 then continue; end if;

    select array_agg(user_id order by match_no, slot_no) into semifinal_losers
    from (
      select bm.match_no, mp.slot_no, mp.user_id
      from public.beylive_matches bm
      join public.beylive_match_players mp on mp.match_id = bm.id
      where bm.tournament_id = final_match.tournament_id
        and bm.round_no = previous_round
        and bm.bracket = 'main'
        and bm.status = 'completed'
        and bm.winner_id is not null
        and mp.user_id <> bm.winner_id
      order by bm.match_no, mp.slot_no
    ) losers;

    if coalesce(array_length(semifinal_losers, 1), 0) = 2 then
      perform public.create_beylive_match(
        final_match.tournament_id,
        final_match.round_no,
        'losers',
        2,
        2,
        final_match.target_score,
        semifinal_losers
      );
    end if;
  end loop;
end $$;

-- When a completed Semifinal is undone, delete every unplayed downstream
-- placeholder created from either participant, including the Final and the
-- 3rd-place match. The existing undo function already removes one stale
-- winner placeholder; this trigger broadens that cleanup for bronze matches.
create or replace function public.clear_beylive_downstream_placeholders()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tournament_format text;
  source_players uuid[];
begin
  if old.status <> 'completed' or new.status = 'completed' or old.bracket <> 'main' then
    return new;
  end if;

  select format into tournament_format from public.tournaments where id = old.tournament_id;
  if tournament_format not in ('single_elimination', 'group_stage') then return new; end if;

  select array_agg(user_id) into source_players
  from public.beylive_match_players
  where match_id = old.id;
  if coalesce(array_length(source_players, 1), 0) = 0 then return new; end if;

  delete from public.beylive_matches bm
  where bm.tournament_id = old.tournament_id
    and bm.round_no > old.round_no
    and bm.status <> 'completed'
    and not exists (
      select 1
      from public.beylive_match_rounds rounds
      where rounds.match_id = bm.id
    )
    and exists (
      select 1
      from public.beylive_match_players mp
      where mp.match_id = bm.id
        and mp.user_id = any(source_players)
    );

  return new;
end $$;

drop trigger if exists beylive_clear_downstream_after_match_update on public.beylive_matches;
create trigger beylive_clear_downstream_after_match_update
  after update of status, winner_id, winner_team_id on public.beylive_matches
  for each row execute function public.clear_beylive_downstream_placeholders();
