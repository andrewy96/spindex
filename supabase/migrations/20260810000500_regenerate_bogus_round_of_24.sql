-- Data correction paired with 20260810000400_elimination_winner_query_bracket_scope.sql:
-- before that fix, advancing past Round of 16 pulled in every completed
-- pool_* match sharing the same (colliding) round_no as the 'main' bracket,
-- producing a "Round of 24" instead of Top 8. This regenerates that round
-- from just the 8 actual Round of 16 winners, scoped to the exact
-- tournament reported (identified by the Chee Hian Round of 16 match).
do $$
declare
  affected_tid uuid;
  round16_no int;
  bogus_round_no int;
  t public.tournaments;
  ids uuid[];
  n int;
  next_match_no int := 1;
  i int;
  players uuid[];
begin
  select bm.tournament_id, bm.round_no into affected_tid, round16_no
  from public.beylive_matches bm
  join public.beylive_match_players mp1 on mp1.match_id = bm.id
  join public.profiles p1 on p1.id = mp1.user_id and p1.display_name = 'Chee Hian'
  join public.tournaments tt on tt.id = bm.tournament_id and tt.status <> 'completed' and tt.format = 'group_stage'
  where bm.bracket = 'main'
  order by bm.round_no asc
  limit 1;

  if affected_tid is null then
    raise notice 'No matching tournament found; nothing to do.';
    return;
  end if;

  select * into t from public.tournaments where id = affected_tid for update;

  select min(round_no) into bogus_round_no
  from public.beylive_matches
  where tournament_id = affected_tid and bracket = 'main' and round_no > round16_no;

  if bogus_round_no is null then
    raise notice 'No further main-bracket round found for tournament %; nothing to do.', affected_tid;
    return;
  end if;

  if (
    select count(*) from public.beylive_matches
    where tournament_id = affected_tid and bracket = 'main' and round_no = bogus_round_no and status = 'completed'
  ) > 0 then
    raise exception 'round % for tournament % already has completed matches; refusing to auto-regenerate', bogus_round_no, affected_tid;
  end if;

  delete from public.beylive_matches
  where tournament_id = affected_tid and bracket = 'main' and round_no = bogus_round_no;

  select array_agg(winner_id order by match_no)
  into ids
  from public.beylive_matches
  where tournament_id = affected_tid
    and round_no = round16_no
    and bracket = 'main'
    and status = 'completed'
    and winner_id is not null;

  n := coalesce(array_length(ids, 1), 0);
  if n <= 1 then
    raise exception 'expected multiple Round of 16 winners for tournament %, found %', affected_tid, n;
  end if;

  i := 1;
  while i <= n loop
    if i = n then
      players := array[ids[i]];
    else
      players := array[ids[i], ids[i + 1]];
    end if;
    perform public.create_beylive_match(affected_tid, bogus_round_no, 'main', next_match_no, next_match_no, t.target_score, players);
    next_match_no := next_match_no + 1;
    i := i + 2;
  end loop;

  raise notice 'Regenerated round % for tournament % from % Round of 16 winners.', bogus_round_no, affected_tid, n;
end $$;
