-- Undoing the point that completed a match (e.g. fixing a wrongly recorded
-- semifinal finish) reverted that match's own status and winner correctly,
-- but left any next-round match already generated from that (now-reverted)
-- winner untouched — so re-completing the match with the correct winner had
-- no way to fix the Final's participant list; the host had no undo/edit path
-- for it at all.
--
-- Fix: after reverting, if the old winner (player or team) had already
-- advanced into a next-round match that hasn't been played yet (no rounds
-- recorded, not completed), delete that placeholder match. It held no real
-- game data, so nothing is lost — once the host re-completes this match with
-- the correct winner and clicks "Advance / Finalize" again, the next round
-- gets regenerated with the right participants.
create or replace function public.undo_beylive_point(mid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.beylive_matches;
  r public.beylive_match_rounds;
  prior_winner_id uuid;
  prior_winner_team_id uuid;
  stale_match_id uuid;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into m from public.beylive_matches where id = mid for update;
  if m is null then raise exception 'match_not_found'; end if;
  if not public.can_manage_beylive(m.tournament_id, auth.uid()) then raise exception 'not_allowed'; end if;

  prior_winner_id := m.winner_id;
  prior_winner_team_id := m.winner_team_id;

  select * into r
  from public.beylive_match_rounds
  where match_id = mid
  order by created_at desc, id desc
  limit 1;
  if r is null then return; end if;

  delete from public.beylive_match_rounds where id = r.id;

  update public.beylive_match_players
  set score = greatest(0, score - r.pts),
      result = 'pending'
  where match_id = mid
    and (
      (r.team_id is not null and team_id = r.team_id)
      or (r.team_id is null and user_id = r.user_id)
    );

  update public.beylive_match_players
  set result = 'pending'
  where match_id = mid;

  update public.beylive_matches
  set status = case when exists (select 1 from public.beylive_match_rounds where match_id = mid) then 'live' else 'scheduled' end,
      winner_id = null,
      winner_team_id = null,
      completed_at = null
  where id = mid;

  if prior_winner_id is not null or prior_winner_team_id is not null then
    select bm2.id into stale_match_id
    from public.beylive_matches bm2
    join public.beylive_match_players mp2 on mp2.match_id = bm2.id
      and (
        (prior_winner_team_id is not null and mp2.team_id = prior_winner_team_id)
        or (prior_winner_team_id is null and mp2.user_id = prior_winner_id)
      )
    where bm2.tournament_id = m.tournament_id
      and bm2.round_no > m.round_no
      and bm2.status <> 'completed'
      and not exists (select 1 from public.beylive_match_rounds where match_id = bm2.id)
    limit 1;

    if stale_match_id is not null then
      delete from public.beylive_matches where id = stale_match_id;
    end if;
  end if;
end $$;
