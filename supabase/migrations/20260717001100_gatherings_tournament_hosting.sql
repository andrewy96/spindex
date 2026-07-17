-- Community gatherings and simple hosted tournaments.
-- Joining is handled by RPCs so capacity/waitlist decisions stay server-side.

create table public.gatherings (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  city text not null,
  venue text not null check (char_length(venue) between 2 and 160),
  gather_at timestamptz not null,
  fee_type text not null default 'free' check (fee_type in ('free', 'paid')),
  fee_amount numeric(8,2) check (fee_amount is null or fee_amount >= 0),
  capacity int check (capacity is null or capacity between 2 and 200),
  join_mode text not null default 'open' check (join_mode in ('open', 'waitlist')),
  note text check (char_length(note) <= 280),
  status text not null default 'open' check (status in ('open', 'cancelled')),
  created_at timestamptz not null default now()
);

create table public.gathering_members (
  gathering_id uuid not null references public.gatherings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('joined', 'waitlisted')),
  created_at timestamptz not null default now(),
  primary key (gathering_id, user_id)
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 100),
  city text not null,
  venue text not null check (char_length(venue) between 2 and 160),
  starts_at timestamptz not null,
  format text not null check (
    format in (
      'single_elimination',
      'double_elimination',
      'round_robin',
      'swiss',
      'free_for_all',
      'leaderboard'
    )
  ),
  max_players int not null default 16 check (max_players between 2 and 256),
  note text check (char_length(note) <= 280),
  status text not null default 'open' check (status in ('open', 'started', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create table public.tournament_players (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('joined', 'waitlisted')),
  seed int,
  created_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

alter table public.gatherings enable row level security;
alter table public.gathering_members enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_players enable row level security;

create policy "gatherings are public" on public.gatherings
  for select using (true);

create policy "host own gathering" on public.gatherings
  for insert with check (auth.uid() = host);

create policy "host cancels own gathering" on public.gatherings
  for update using (auth.uid() = host and status = 'open')
  with check (auth.uid() = host and status in ('open', 'cancelled'));

create policy "gathering members are public" on public.gathering_members
  for select using (true);

create policy "tournaments are public" on public.tournaments
  for select using (true);

create policy "host own tournament" on public.tournaments
  for insert with check (auth.uid() = host);

create policy "host updates own tournament" on public.tournaments
  for update using (auth.uid() = host and status in ('open', 'started'))
  with check (auth.uid() = host and status in ('open', 'started', 'completed', 'cancelled'));

create policy "tournament players are public" on public.tournament_players
  for select using (true);

grant select on public.gatherings, public.gathering_members, public.tournaments, public.tournament_players to anon, authenticated;
grant insert on public.gatherings, public.tournaments to authenticated;
grant update (status) on public.gatherings, public.tournaments to authenticated;

create or replace function public.join_gathering(gid uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  g public.gatherings;
  joined_count int;
  existing_status text;
  next_status text;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;

  select * into g from public.gatherings where id = gid for update;
  if g is null then raise exception 'gathering_not_found'; end if;
  if g.status <> 'open' then raise exception 'gathering_not_open'; end if;

  select status into existing_status
  from public.gathering_members
  where gathering_id = gid and user_id = auth.uid();
  if existing_status is not null then return existing_status; end if;

  select count(*) into joined_count
  from public.gathering_members
  where gathering_id = gid and status = 'joined';

  next_status := case
    when g.join_mode = 'waitlist' then 'waitlisted'
    when g.capacity is not null and joined_count >= g.capacity then 'waitlisted'
    else 'joined'
  end;

  insert into public.gathering_members (gathering_id, user_id, status)
  values (gid, auth.uid(), next_status);

  return next_status;
end $$;

create or replace function public.leave_gathering(gid uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  delete from public.gathering_members
  where gathering_id = gid and user_id = auth.uid();
end $$;

create or replace function public.join_tournament(tid uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  t public.tournaments;
  joined_count int;
  existing_status text;
  next_status text;
  next_seed int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;

  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.status <> 'open' then raise exception 'tournament_not_open'; end if;

  select status into existing_status
  from public.tournament_players
  where tournament_id = tid and user_id = auth.uid();
  if existing_status is not null then return existing_status; end if;

  select count(*) into joined_count
  from public.tournament_players
  where tournament_id = tid and status = 'joined';

  next_status := case when joined_count >= t.max_players then 'waitlisted' else 'joined' end;
  next_seed := case when next_status = 'joined' then joined_count + 1 else null end;

  insert into public.tournament_players (tournament_id, user_id, status, seed)
  values (tid, auth.uid(), next_status, next_seed);

  return next_status;
end $$;

create or replace function public.leave_tournament(tid uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  delete from public.tournament_players
  where tournament_id = tid and user_id = auth.uid();
end $$;

revoke execute on function public.join_gathering(uuid) from anon;
revoke execute on function public.leave_gathering(uuid) from anon;
revoke execute on function public.join_tournament(uuid) from anon;
revoke execute on function public.leave_tournament(uuid) from anon;
grant execute on function public.join_gathering(uuid) to authenticated;
grant execute on function public.leave_gathering(uuid) to authenticated;
grant execute on function public.join_tournament(uuid) to authenticated;
grant execute on function public.leave_tournament(uuid) to authenticated;

create index gatherings_status_city_time_idx on public.gatherings (status, city, gather_at);
create index gathering_members_user_idx on public.gathering_members (user_id, created_at desc);
create index tournaments_status_city_time_idx on public.tournaments (status, city, starts_at);
create index tournament_players_user_idx on public.tournament_players (user_id, created_at desc);
