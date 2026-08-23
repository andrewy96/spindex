-- BEYLIVE stadium setup and judge assignment.
-- Hosts can set how many physical stadiums are active for the event. Each
-- stadium gets its own stream metadata, and tournament judges can be assigned
-- to a specific stadium while hosts keep full control.

alter table public.tournaments
  add column if not exists beylive_stadium_count int not null default 2;

alter table public.tournaments
  drop constraint if exists tournaments_beylive_stadium_count_check;

alter table public.tournaments
  add constraint tournaments_beylive_stadium_count_check
  check (beylive_stadium_count between 1 and 16);

grant update (beylive_stadium_count) on public.tournaments to authenticated;

alter table public.beylive_judges
  add column if not exists stadium_no int;

alter table public.beylive_judges
  drop constraint if exists beylive_judges_stadium_no_check;

alter table public.beylive_judges
  add constraint beylive_judges_stadium_no_check
  check (stadium_no is null or stadium_no between 1 and 16);

create table if not exists public.beylive_stadiums (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  stadium_no int not null check (stadium_no between 1 and 16),
  label text,
  stream_url text,
  stream_title text,
  stream_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, stadium_no)
);

alter table public.beylive_stadiums
  drop constraint if exists beylive_stadiums_label_length_check;
alter table public.beylive_stadiums
  add constraint beylive_stadiums_label_length_check
  check (label is null or char_length(label) <= 40);

alter table public.beylive_stadiums
  drop constraint if exists beylive_stadiums_stream_url_length_check;
alter table public.beylive_stadiums
  add constraint beylive_stadiums_stream_url_length_check
  check (stream_url is null or char_length(stream_url) <= 500);

alter table public.beylive_stadiums
  drop constraint if exists beylive_stadiums_stream_title_length_check;
alter table public.beylive_stadiums
  add constraint beylive_stadiums_stream_title_length_check
  check (stream_title is null or char_length(stream_title) <= 80);

alter table public.beylive_stadiums enable row level security;

drop policy if exists "beylive stadiums are public" on public.beylive_stadiums;
create policy "beylive stadiums are public" on public.beylive_stadiums
  for select using (true);

drop policy if exists "hosts insert beylive stadiums" on public.beylive_stadiums;
create policy "hosts insert beylive stadiums" on public.beylive_stadiums
  for insert with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.host = auth.uid()
    )
  );

drop policy if exists "hosts update beylive stadiums" on public.beylive_stadiums;
create policy "hosts update beylive stadiums" on public.beylive_stadiums
  for update using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.host = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.host = auth.uid()
    )
  );

drop policy if exists "hosts delete beylive stadiums" on public.beylive_stadiums;
create policy "hosts delete beylive stadiums" on public.beylive_stadiums
  for delete using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.host = auth.uid()
    )
  );

grant select on public.beylive_stadiums to anon, authenticated;
grant insert, update, delete on public.beylive_stadiums to authenticated;
grant update (stadium_no) on public.beylive_judges to authenticated;

create index if not exists beylive_stadiums_tournament_idx
  on public.beylive_stadiums (tournament_id, stadium_no);

create or replace function public.beylive_effective_table_no(tid uuid, proposed_table_no int, proposed_match_no int)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select ((greatest(1, coalesce(proposed_table_no, proposed_match_no, 1)) - 1)
    % greatest(1, coalesce(t.beylive_stadium_count, 2))) + 1
  from public.tournaments t
  where t.id = tid;
$$;

create or replace function public.sync_beylive_stadium_rows(tid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stadium_count int;
begin
  select greatest(1, least(16, coalesce(t.beylive_stadium_count, 2)))
  into stadium_count
  from public.tournaments t
  where t.id = tid;

  if stadium_count is null then
    return;
  end if;

  insert into public.beylive_stadiums (tournament_id, stadium_no, label)
  select tid, n, 'Stadium ' || n
  from generate_series(1, stadium_count) as n
  on conflict (tournament_id, stadium_no) do nothing;

  delete from public.beylive_stadiums
  where tournament_id = tid and stadium_no > stadium_count;

  update public.beylive_judges
  set stadium_no = null
  where tournament_id = tid
    and stadium_no is not null
    and stadium_no > stadium_count;

  update public.beylive_matches
  set table_no = public.beylive_effective_table_no(tournament_id, table_no, match_no)
  where tournament_id = tid
    and status in ('scheduled', 'live')
    and table_no is not null;
end $$;

create or replace function public.maintain_beylive_stadium_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_beylive_stadium_rows(new.id);
  return new;
end $$;

drop trigger if exists tournaments_beylive_stadium_rows_after_write on public.tournaments;
create trigger tournaments_beylive_stadium_rows_after_write
  after insert or update of beylive_stadium_count on public.tournaments
  for each row execute function public.maintain_beylive_stadium_rows();

insert into public.beylive_stadiums (tournament_id, stadium_no, label, stream_url, stream_title, stream_enabled)
select t.id, n, 'Stadium ' || n,
  case when n = 1 then t.stadium1_stream_url when n = 2 then t.stadium2_stream_url else null end,
  case when n = 1 then t.stadium1_stream_title when n = 2 then t.stadium2_stream_title else null end,
  case when n = 1 then coalesce(t.stadium1_stream_enabled, false) when n = 2 then coalesce(t.stadium2_stream_enabled, false) else false end
from public.tournaments t
cross join generate_series(1, greatest(1, least(16, coalesce(t.beylive_stadium_count, 2)))) as n
on conflict (tournament_id, stadium_no) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.beylive_stadiums;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

create or replace function public.can_score_beylive_match(mid uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.beylive_matches m
    join public.tournaments t on t.id = m.tournament_id
    where m.id = mid and t.host = uid
  ) or exists (
    select 1
    from public.beylive_matches m
    join public.beylive_judges j
      on j.tournament_id = m.tournament_id
     and j.user_id = uid
    where m.id = mid
      and (j.stadium_no is null or j.stadium_no = m.table_no)
  ) or exists (
    select 1
    from public.beylive_matches m
    join public.profiles p on p.id = uid
    where m.id = mid
      and p.beylive_judge is true
      and p.is_walkin is false
      and not exists (
        select 1
        from public.beylive_judges j
        where j.tournament_id = m.tournament_id
          and j.user_id = uid
          and j.stadium_no is not null
      )
  );
$$;

revoke execute on function public.beylive_effective_table_no(uuid, int, int) from public, anon, authenticated;
revoke execute on function public.sync_beylive_stadium_rows(uuid) from public, anon, authenticated;
revoke execute on function public.maintain_beylive_stadium_rows() from public, anon, authenticated;
revoke execute on function public.can_score_beylive_match(uuid, uuid) from public, anon;
grant execute on function public.can_score_beylive_match(uuid, uuid) to authenticated;

create or replace function public.create_beylive_match(
  p_tournament_id uuid,
  p_round_no int,
  p_bracket text,
  p_match_no int,
  p_table_no int,
  p_target_score int,
  p_players uuid[]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
  player_id uuid;
  slot int := 1;
  player_count int := coalesce(array_length(p_players, 1), 0);
begin
  if player_count = 0 then
    raise exception 'no_players';
  end if;

  insert into public.beylive_matches (
    tournament_id,
    round_no,
    bracket,
    match_no,
    table_no,
    target_score,
    status,
    winner_id,
    completed_at
  )
  values (
    p_tournament_id,
    p_round_no,
    p_bracket,
    p_match_no,
    public.beylive_effective_table_no(p_tournament_id, p_table_no, p_match_no),
    p_target_score,
    case when player_count = 1 then 'completed' else 'scheduled' end,
    case when player_count = 1 then p_players[1] else null end,
    case when player_count = 1 then now() else null end
  )
  returning id into mid;

  foreach player_id in array p_players loop
    insert into public.beylive_match_players (match_id, user_id, slot_no, result)
    values (
      mid,
      player_id,
      slot,
      case when player_count = 1 then 'win' else 'pending' end
    );
    slot := slot + 1;
  end loop;

  return mid;
end $$;

create or replace function public.create_beylive_team_match(
  p_tournament_id uuid,
  p_round_no int,
  p_bracket text,
  p_match_no int,
  p_table_no int,
  p_target_score int,
  p_teams uuid[]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
  v_team_id uuid;
  captain_id uuid;
  winner_captain_id uuid;
  slot int := 1;
  team_count int := coalesce(array_length(p_teams, 1), 0);
begin
  if team_count = 0 then
    raise exception 'no_teams';
  end if;

  insert into public.beylive_matches (
    tournament_id,
    round_no,
    bracket,
    match_no,
    table_no,
    target_score,
    status,
    winner_id,
    winner_team_id,
    completed_at
  )
  values (
    p_tournament_id,
    p_round_no,
    p_bracket,
    p_match_no,
    public.beylive_effective_table_no(p_tournament_id, p_table_no, p_match_no),
    p_target_score,
    case when team_count = 1 then 'completed' else 'scheduled' end,
    null,
    case when team_count = 1 then p_teams[1] else null end,
    case when team_count = 1 then now() else null end
  )
  returning id into mid;

  foreach v_team_id in array p_teams loop
    select btm.user_id into captain_id
    from public.beylive_team_members btm
    where btm.tournament_id = p_tournament_id
      and btm.team_id = v_team_id
    order by btm.slot_no
    limit 1;

    if captain_id is null then
      raise exception 'team_has_no_members';
    end if;

    if team_count = 1 and v_team_id = p_teams[1] then
      winner_captain_id := captain_id;
    end if;

    insert into public.beylive_match_players (match_id, user_id, team_id, slot_no, result)
    values (
      mid,
      captain_id,
      v_team_id,
      slot,
      case when team_count = 1 then 'win' else 'pending' end
    );
    slot := slot + 1;
  end loop;

  if team_count = 1 then
    update public.beylive_matches
    set winner_id = winner_captain_id
    where id = mid;
  end if;

  return mid;
end $$;

create or replace function public.start_beylive_match(mid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.beylive_matches;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into m from public.beylive_matches where id = mid for update;
  if m is null then raise exception 'match_not_found'; end if;
  if not public.can_score_beylive_match(mid, auth.uid()) then raise exception 'not_allowed'; end if;
  if m.status <> 'scheduled' then return; end if;

  update public.beylive_matches
  set status = 'live', started_at = coalesce(started_at, now())
  where id = mid;
end $$;

create or replace function public.record_beylive_point(mid uuid, player_id uuid, finish text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.beylive_matches;
  pts int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into m from public.beylive_matches where id = mid for update;
  if m is null then raise exception 'match_not_found'; end if;
  if not public.can_score_beylive_match(mid, auth.uid()) then raise exception 'not_allowed'; end if;
  if m.status = 'completed' then raise exception 'match_completed'; end if;
  if finish not in ('spin', 'over', 'burst', 'xtreme') then raise exception 'invalid_finish'; end if;

  pts := case
    when finish = 'spin' then 1
    when finish in ('over', 'burst') then 2
    else 3
  end;

  perform 1 from public.beylive_match_players
  where match_id = mid and user_id = player_id
  for update;
  if not found then raise exception 'player_not_in_match'; end if;

  insert into public.beylive_match_rounds (match_id, user_id, finish, pts, created_by)
  values (mid, player_id, finish, pts, auth.uid());

  update public.beylive_match_players
  set score = score + pts,
      result = 'pending'
  where match_id = mid and user_id = player_id;

  update public.beylive_match_players
  set result = 'pending'
  where match_id = mid;

  if m.status = 'scheduled' then
    update public.beylive_matches
    set status = 'live', started_at = coalesce(started_at, now())
    where id = mid;
  end if;
end $$;

create or replace function public.record_beylive_team_point(mid uuid, p_team_id uuid, finish text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.beylive_matches;
  participant public.beylive_match_players;
  pts int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into m from public.beylive_matches where id = mid for update;
  if m is null then raise exception 'match_not_found'; end if;
  if not public.can_score_beylive_match(mid, auth.uid()) then raise exception 'not_allowed'; end if;
  if m.status = 'completed' then raise exception 'match_completed'; end if;
  if finish not in ('spin', 'over', 'burst', 'xtreme') then raise exception 'invalid_finish'; end if;

  pts := case
    when finish = 'spin' then 1
    when finish in ('over', 'burst') then 2
    else 3
  end;

  select * into participant
  from public.beylive_match_players
  where match_id = mid and team_id = p_team_id
  for update;
  if participant is null then raise exception 'team_not_in_match'; end if;

  insert into public.beylive_match_rounds (match_id, user_id, team_id, finish, pts, created_by)
  values (mid, participant.user_id, p_team_id, finish, pts, auth.uid());

  update public.beylive_match_players
  set score = score + pts,
      result = 'pending'
  where match_id = mid and team_id = p_team_id;

  update public.beylive_match_players
  set result = 'pending'
  where match_id = mid;

  if m.status = 'scheduled' then
    update public.beylive_matches
    set status = 'live', started_at = coalesce(started_at, now())
    where id = mid;
  end if;
end $$;

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
  if not public.can_score_beylive_match(mid, auth.uid()) then raise exception 'not_allowed'; end if;

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

create or replace function public.complete_beylive_match(mid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.beylive_matches;
  winner_user uuid;
  winner_team uuid;
  top_score int;
  tied_top int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into m from public.beylive_matches where id = mid for update;
  if m is null then raise exception 'match_not_found'; end if;
  if not public.can_score_beylive_match(mid, auth.uid()) then raise exception 'not_allowed'; end if;

  select max(score) into top_score
  from public.beylive_match_players
  where match_id = mid;
  if coalesce(top_score, 0) < m.target_score then raise exception 'winner_below_target'; end if;

  select count(*) into tied_top
  from public.beylive_match_players
  where match_id = mid and score = top_score;
  if tied_top <> 1 then raise exception 'score_tie'; end if;

  select user_id, team_id into winner_user, winner_team
  from public.beylive_match_players
  where match_id = mid
  order by score desc, slot_no asc
  limit 1;

  update public.beylive_match_players
  set result = case
    when winner_team is not null and team_id = winner_team then 'win'
    when winner_team is null and user_id = winner_user then 'win'
    else 'loss'
  end
  where match_id = mid;

  update public.beylive_matches
  set status = 'completed',
      winner_id = winner_user,
      winner_team_id = winner_team,
      completed_at = now()
  where id = mid;
end $$;
