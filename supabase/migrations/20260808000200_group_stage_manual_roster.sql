-- Manual roster + pool control for hosts running a group_stage tournament
-- at the table, where not every blader has (or wants) an account:
--   * add_tournament_walkin lets the host add a participant by name only —
--     it creates a real (anonymous) auth.users row so the walk-in flows
--     through the exact same tournament_players/pool_no/BEYLIVE machinery
--     as a logged-in player, rather than a parallel local-only system.
--   * remove_tournament_player lets the host drop anyone from the roster.
--   * draw_group_stage_pools lets the host trigger the pool draw as a
--     preview step before starting BEYLIVE (rather than only at start time).
--   * set_tournament_player_pool lets the host manually move one player to
--     a different pool afterwards.
-- assign_group_stage_pools is rewritten to only fill *unassigned* seats
-- (pool_no is null), so re-running it (via draw_group_stage_pools, or via
-- start_beylive picking up any still-unassigned walk-ins) never disturbs a
-- pool the host already drew or hand-adjusted.

alter table public.profiles
  add column if not exists is_walkin boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_gender text;
  v_birthday date;
begin
  v_gender := nullif(new.raw_user_meta_data->>'gender', '');
  if v_gender is not null and v_gender not in ('male', 'female') then
    v_gender := null;
  end if;

  if coalesce(new.raw_user_meta_data->>'birthday', '') ~ '^\d{4}-\d{2}-\d{2}$' then
    v_birthday := (new.raw_user_meta_data->>'birthday')::date;
  end if;
  if v_birthday is not null
     and not (v_birthday between date '1900-01-01' and current_date) then
    v_birthday := null;
  end if;

  insert into public.profiles (id, handle, display_name, city, is_walkin)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'handle', ''), 'blader_' || substr(replace(new.id::text, '-', ''), 1, 10)),
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), new.raw_user_meta_data->>'handle', 'Blader'),
    new.raw_user_meta_data->>'city',
    coalesce(new.is_anonymous, false)
  );

  insert into public.profile_private (id, gender, birthday, age)
  values (new.id, v_gender, v_birthday, public.profile_age_from_birthday(v_birthday));

  return new;
end $$;

-- Rewritten: only places players with pool_no is null, treating any already
-- -seated player (from a prior draw or a manual override) as fixed. Capacity
-- per pool is recomputed from the full joined headcount each call, so pools
-- keep absorbing the remainder correctly as walk-ins are added over time.
create or replace function public.assign_group_stage_pools(tid uuid, p_pool_count int default 8)
returns void
language plpgsql security definer set search_path = public as $$
declare
  n int;
  base_size int;
  remainder int;
  p int;
  r record;
  chosen_pool int;
begin
  select count(*) into n
  from public.tournament_players
  where tournament_id = tid and status = 'joined';

  if n < p_pool_count * 2 then
    raise exception 'not_enough_players_for_pools';
  end if;

  base_size := n / p_pool_count;
  remainder := n % p_pool_count;

  create temp table if not exists _gs_pool_state (
    pool_no int primary key,
    capacity int not null,
    filled int not null default 0
  ) on commit drop;
  delete from _gs_pool_state;

  for p in 1..p_pool_count loop
    insert into _gs_pool_state (pool_no, capacity, filled)
    select
      p,
      base_size + (case when p <= remainder then 1 else 0 end),
      (
        select count(*) from public.tournament_players
        where tournament_id = tid and status = 'joined' and pool_no = p
      );
  end loop;

  create temp table if not exists _gs_pool_clubs (
    pool_no int not null,
    club_key text not null
  ) on commit drop;
  delete from _gs_pool_clubs;

  -- Seed with the club of everyone already seated, so new arrivals still
  -- avoid a club clash with players placed by an earlier draw or by hand.
  insert into _gs_pool_clubs (pool_no, club_key)
  select
    tp.pool_no,
    coalesce(nullif(lower(trim(split_part(pr.display_name, ' ', 1))), ''), 'solo_' || tp.user_id::text)
  from public.tournament_players tp
  join public.profiles pr on pr.id = tp.user_id
  where tp.tournament_id = tid and tp.status = 'joined' and tp.pool_no is not null;

  create temp table if not exists _gs_players (
    user_id uuid primary key,
    club_key text not null,
    club_size int not null,
    seed int
  ) on commit drop;
  delete from _gs_players;

  insert into _gs_players (user_id, club_key, club_size, seed)
  select
    tp.user_id,
    ck.club_key,
    count(*) over (partition by ck.club_key),
    tp.seed
  from public.tournament_players tp
  join public.profiles pr on pr.id = tp.user_id
  cross join lateral (
    select coalesce(nullif(lower(trim(split_part(pr.display_name, ' ', 1))), ''), 'solo_' || tp.user_id::text) as club_key
  ) ck
  where tp.tournament_id = tid and tp.status = 'joined' and tp.pool_no is null;

  for r in
    select * from _gs_players
    order by club_size desc, club_key, coalesce(seed, 999999), user_id
  loop
    select ps.pool_no into chosen_pool
    from _gs_pool_state ps
    where ps.filled < ps.capacity
      and not exists (
        select 1 from _gs_pool_clubs pc
        where pc.pool_no = ps.pool_no and pc.club_key = r.club_key
      )
    order by ps.filled asc, ps.pool_no asc
    limit 1;

    if chosen_pool is null then
      select ps.pool_no into chosen_pool
      from _gs_pool_state ps
      where ps.filled < ps.capacity
      order by ps.filled asc, ps.pool_no asc
      limit 1;
    end if;

    if chosen_pool is null then
      raise exception 'pool_assignment_failed';
    end if;

    update _gs_pool_state set filled = filled + 1 where pool_no = chosen_pool;
    insert into _gs_pool_clubs (pool_no, club_key) values (chosen_pool, r.club_key);
    update public.tournament_players
    set pool_no = chosen_pool
    where tournament_id = tid and user_id = r.user_id;
  end loop;
end $$;

-- Adds a nameless-account participant: a real (anonymous) auth.users row so
-- handle_new_user() creates a normal profiles row for them, then joins them
-- to the tournament exactly like join_tournament does for a logged-in user.
create or replace function public.add_tournament_walkin(tid uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t public.tournaments;
  new_id uuid := gen_random_uuid();
  new_handle text;
  clean_name text;
  joined_count int;
  next_status text;
  next_seed int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.host <> auth.uid() then raise exception 'not_allowed'; end if;
  if t.status <> 'open' then raise exception 'tournament_not_open'; end if;

  clean_name := nullif(trim(p_name), '');
  if clean_name is null or char_length(clean_name) > 60 then
    raise exception 'invalid_name';
  end if;

  new_handle := 'guest_' || substr(replace(new_id::text, '-', ''), 1, 10);

  insert into auth.users (id, is_anonymous, created_at, updated_at, aud, role, raw_user_meta_data)
  values (
    new_id,
    true,
    now(),
    now(),
    'authenticated',
    'authenticated',
    jsonb_build_object('handle', new_handle, 'display_name', clean_name)
  );

  select count(*) into joined_count
  from public.tournament_players
  where tournament_id = tid and status = 'joined';

  next_status := case when joined_count >= t.max_players then 'waitlisted' else 'joined' end;
  next_seed := case when next_status = 'joined' then joined_count + 1 else null end;

  insert into public.tournament_players (tournament_id, user_id, status, seed)
  values (tid, new_id, next_status, next_seed);

  return new_id;
end $$;

create or replace function public.remove_tournament_player(tid uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tournaments;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.host <> auth.uid() then raise exception 'not_allowed'; end if;
  if t.status <> 'open' then raise exception 'tournament_not_open'; end if;

  delete from public.tournament_players
  where tournament_id = tid and user_id = p_user_id;

  if not found then raise exception 'player_not_found'; end if;
end $$;

create or replace function public.draw_group_stage_pools(tid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tournaments;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.host <> auth.uid() then raise exception 'not_allowed'; end if;
  if t.format <> 'group_stage' then raise exception 'wrong_format'; end if;
  if t.status <> 'open' then raise exception 'tournament_not_open'; end if;

  perform public.assign_group_stage_pools(tid, 8);
end $$;

create or replace function public.set_tournament_player_pool(tid uuid, p_user_id uuid, p_pool_no int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tournaments;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.host <> auth.uid() then raise exception 'not_allowed'; end if;
  if t.format <> 'group_stage' then raise exception 'wrong_format'; end if;
  if t.status <> 'open' then raise exception 'tournament_not_open'; end if;
  if p_pool_no is not null and p_pool_no not between 1 and 8 then
    raise exception 'invalid_pool';
  end if;

  update public.tournament_players
  set pool_no = p_pool_no
  where tournament_id = tid and user_id = p_user_id and status = 'joined';

  if not found then raise exception 'player_not_found'; end if;
end $$;

revoke execute on function public.add_tournament_walkin(uuid, text) from public;
revoke execute on function public.remove_tournament_player(uuid, uuid) from public;
revoke execute on function public.draw_group_stage_pools(uuid) from public;
revoke execute on function public.set_tournament_player_pool(uuid, uuid, int) from public;

grant execute on function public.add_tournament_walkin(uuid, text) to authenticated;
grant execute on function public.remove_tournament_player(uuid, uuid) to authenticated;
grant execute on function public.draw_group_stage_pools(uuid) to authenticated;
grant execute on function public.set_tournament_player_pool(uuid, uuid, int) to authenticated;
