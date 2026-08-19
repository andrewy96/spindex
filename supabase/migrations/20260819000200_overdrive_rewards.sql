-- OVERDRIVE point economy: signup/referral bonuses, daily rewards, challenge limits,
-- admin-safe challenge deletion support, and exchange balances.

alter table public.profiles
  alter column stars set default 1000,
  add column if not exists diamonds int not null default 0 check (diamonds >= 0),
  add column if not exists gold_bars int not null default 0 check (gold_bars >= 0);

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

  insert into public.profiles (id, handle, display_name, city, stars)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'handle', ''), 'blader_' || substr(replace(new.id::text, '-', ''), 1, 10)),
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), new.raw_user_meta_data->>'handle', 'Blader'),
    new.raw_user_meta_data->>'city',
    1000
  );

  insert into public.profile_private (id, gender, birthday, age)
  values (new.id, v_gender, v_birthday, public.profile_age_from_birthday(v_birthday))
  on conflict (id) do update
    set gender = excluded.gender,
        birthday = excluded.birthday,
        age = excluded.age;

  return new;
end $$;

alter table public.challenges
  alter column wager set default 10;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.challenges'::regclass
      and conname = 'challenges_wager_check'
  ) then
    alter table public.challenges drop constraint challenges_wager_check;
  end if;
end $$;

alter table public.challenges
  add constraint challenges_wager_check check (wager between 10 and 100) not valid;

drop policy if exists "post covered open challenge" on public.challenges;
create policy "post covered open challenge" on public.challenges
  for insert with check (
    auth.uid() = host
    and status = 'open'
    and opponent is null
    and player1 is null
    and player2 is null
    and play_mode in ('player', 'judge')
    and (
      (format = 'single' and team_size = 1)
      or (format = 'team' and team_size between 2 and 20)
    )
    and target_score between 1 and 30
    and wager between 10 and 100
    and (
      play_mode = 'judge'
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.stars >= wager
      )
    )
  );

create table if not exists public.point_reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('daily_login', 'daily_battle')),
  reward_date date not null default ((now() at time zone 'Asia/Kuala_Lumpur')::date),
  points int not null check (points > 0),
  match_id uuid references public.matches (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, kind, reward_date)
);

alter table public.point_reward_claims enable row level security;

drop policy if exists "read own point rewards" on public.point_reward_claims;
create policy "read own point rewards" on public.point_reward_claims
  for select using (auth.uid() = user_id);

revoke all on public.point_reward_claims from anon;
grant select on public.point_reward_claims to authenticated;

create or replace function public.try_award_daily_points(
  p_user uuid,
  p_kind text,
  p_points int,
  p_match uuid default null
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  inserted_id uuid;
begin
  if p_user is null or p_kind not in ('daily_login', 'daily_battle') or p_points <= 0 then
    return false;
  end if;

  insert into public.point_reward_claims (user_id, kind, reward_date, points, match_id)
  values (p_user, p_kind, (now() at time zone 'Asia/Kuala_Lumpur')::date, p_points, p_match)
  on conflict (user_id, kind, reward_date) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    return false;
  end if;

  update public.profiles
  set stars = stars + p_points
  where id = p_user;

  return true;
end $$;

revoke execute on function public.try_award_daily_points(uuid, text, int, uuid) from public;
revoke execute on function public.try_award_daily_points(uuid, text, int, uuid) from anon;
revoke execute on function public.try_award_daily_points(uuid, text, int, uuid) from authenticated;

create or replace function public.claim_daily_login()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  awarded boolean;
  p public.profiles;
begin
  if v_user is null then raise exception 'login_required'; end if;

  awarded := public.try_award_daily_points(v_user, 'daily_login', 20, null);

  select * into p from public.profiles where id = v_user;
  return jsonb_build_object(
    'awarded', awarded,
    'points', case when awarded then 20 else 0 end,
    'balance', p.stars,
    'diamonds', p.diamonds,
    'goldBars', p.gold_bars
  );
end $$;

revoke execute on function public.claim_daily_login() from public;
revoke execute on function public.claim_daily_login() from anon;
grant execute on function public.claim_daily_login() to authenticated;

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  referred_id uuid not null unique references public.profiles (id) on delete cascade,
  points int not null default 50 check (points > 0),
  code text not null,
  created_at timestamptz not null default now(),
  check (referrer_id <> referred_id)
);

alter table public.referral_rewards enable row level security;

drop policy if exists "read own referral rewards" on public.referral_rewards;
create policy "read own referral rewards" on public.referral_rewards
  for select using (auth.uid() = referrer_id or auth.uid() = referred_id);

revoke all on public.referral_rewards from anon;
grant select on public.referral_rewards to authenticated;

create or replace function public.apply_referral_code(p_referred uuid, p_code text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  normalized text;
  referrer public.profiles;
  inserted_id uuid;
begin
  normalized := lower(regexp_replace(trim(coalesce(p_code, '')), '^@', ''));
  if normalized = '' then return false; end if;

  select *
  into referrer
  from public.profiles
  where lower(handle) = normalized
     or lower(coalesce(player_code, '')) = normalized
  order by created_at asc
  limit 1;

  if referrer.id is null or referrer.id = p_referred then
    return false;
  end if;

  insert into public.referral_rewards (referrer_id, referred_id, points, code)
  values (referrer.id, p_referred, 50, normalized)
  on conflict (referred_id) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    return false;
  end if;

  update public.profiles
  set stars = stars + 50
  where id in (referrer.id, p_referred);

  return true;
end $$;

revoke execute on function public.apply_referral_code(uuid, text) from public;
revoke execute on function public.apply_referral_code(uuid, text) from anon;
revoke execute on function public.apply_referral_code(uuid, text) from authenticated;
grant execute on function public.apply_referral_code(uuid, text) to service_role;

create table if not exists public.overdrive_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reward text not null check (reward in ('diamond', 'gold_bar', 'ux20', 'ux00')),
  points_spent int not null default 0 check (points_spent >= 0),
  diamonds_spent int not null default 0 check (diamonds_spent >= 0),
  diamonds_gained int not null default 0 check (diamonds_gained >= 0),
  gold_bars_gained int not null default 0 check (gold_bars_gained >= 0),
  item_code text,
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.overdrive_redemptions enable row level security;

drop policy if exists "read own overdrive redemptions" on public.overdrive_redemptions;
create policy "read own overdrive redemptions" on public.overdrive_redemptions
  for select using (auth.uid() = user_id);

revoke all on public.overdrive_redemptions from anon;
grant select on public.overdrive_redemptions to authenticated;

create or replace function public.redeem_overdrive_reward(p_reward text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  normalized text := lower(trim(coalesce(p_reward, '')));
  p public.profiles;
begin
  if v_user is null then raise exception 'login_required'; end if;

  select * into p from public.profiles where id = v_user for update;
  if p.id is null then raise exception 'profile_not_found'; end if;

  if normalized = 'diamond' then
    if p.stars < 10000 then raise exception 'not_enough_points'; end if;
    update public.profiles
    set stars = stars - 10000,
        diamonds = diamonds + 1
    where id = v_user;
    insert into public.overdrive_redemptions
      (user_id, reward, points_spent, diamonds_gained, status)
    values (v_user, 'diamond', 10000, 1, 'fulfilled');
  elsif normalized = 'gold_bar' then
    if p.diamonds < 10 then raise exception 'not_enough_diamonds'; end if;
    update public.profiles
    set diamonds = diamonds - 10,
        gold_bars = gold_bars + 1
    where id = v_user;
    insert into public.overdrive_redemptions
      (user_id, reward, diamonds_spent, gold_bars_gained, status)
    values (v_user, 'gold_bar', 10, 1, 'fulfilled');
  elsif normalized = 'ux20' then
    if p.diamonds < 5 then raise exception 'not_enough_diamonds'; end if;
    update public.profiles
    set diamonds = diamonds - 5
    where id = v_user;
    insert into public.overdrive_redemptions
      (user_id, reward, diamonds_spent, item_code, status)
    values (v_user, 'ux20', 5, 'UX-20', 'pending');
  elsif normalized = 'ux00' then
    if p.diamonds < 10 then raise exception 'not_enough_diamonds'; end if;
    update public.profiles
    set diamonds = diamonds - 10
    where id = v_user;
    insert into public.overdrive_redemptions
      (user_id, reward, diamonds_spent, item_code, status)
    values (v_user, 'ux00', 10, 'UX-00', 'pending');
  else
    raise exception 'invalid_reward';
  end if;

  select * into p from public.profiles where id = v_user;
  return jsonb_build_object(
    'points', p.stars,
    'diamonds', p.diamonds,
    'goldBars', p.gold_bars
  );
end $$;

revoke execute on function public.redeem_overdrive_reward(text) from public;
revoke execute on function public.redeem_overdrive_reward(text) from anon;
grant execute on function public.redeem_overdrive_reward(text) to authenticated;

create or replace function public.finalize_reported_match(mid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  loser uuid;
  transfer int;
begin
  select * into m from matches where id = mid for update;
  if m is null then raise exception 'match_not_found'; end if;
  if m.status <> 'pending' then return; end if;

  loser := case when m.winner = m.p1 then m.p2 else m.p1 end;

  perform 1 from profiles where id = m.winner for update;
  select least(m.wager, stars) into transfer from profiles where id = loser for update;
  transfer := coalesce(transfer, 0);

  update profiles set stars = stars + transfer, wins = wins + 1 where id = m.winner;
  update profiles set stars = stars - transfer, losses = losses + 1 where id = loser;
  update matches
    set status = 'confirmed',
        confirmed_at = now(),
        stars_moved = transfer
    where id = mid;

  perform public.try_award_daily_points(m.p1, 'daily_battle', 20, mid);
  perform public.try_award_daily_points(m.p2, 'daily_battle', 20, mid);
end $$;
