-- Superadmin controls for manual star adjustments.

create table if not exists public.superadmins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

alter table public.superadmins enable row level security;

create table if not exists public.star_adjustments (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete restrict,
  target_id uuid not null references public.profiles (id) on delete cascade,
  delta int not null check (delta <> 0 and delta between -1000 and 1000),
  before_stars int not null check (before_stars >= 0),
  after_stars int not null check (after_stars >= 0),
  reason text check (reason is null or char_length(reason) <= 240),
  created_at timestamptz not null default now()
);

alter table public.star_adjustments enable row level security;

create index if not exists star_adjustments_target_idx
  on public.star_adjustments (target_id, created_at desc);

create index if not exists star_adjustments_admin_idx
  on public.star_adjustments (admin_id, created_at desc);

insert into public.superadmins (user_id, note)
select id, 'Initial superadmin'
from public.profiles
where lower(handle) = lower('Andrew_666')
on conflict (user_id) do nothing;

create or replace function public.admin_adjust_stars(
  p_admin uuid,
  p_target uuid,
  p_delta int,
  p_reason text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  before_value int;
  after_value int;
  target_profile profiles;
begin
  if not exists (select 1 from public.superadmins where user_id = p_admin) then
    raise exception 'not_superadmin';
  end if;

  if p_delta = 0 or p_delta < -1000 or p_delta > 1000 then
    raise exception 'invalid_delta';
  end if;

  select stars into before_value
  from public.profiles
  where id = p_target
  for update;

  if before_value is null then
    raise exception 'profile_not_found';
  end if;

  after_value := before_value + p_delta;
  if after_value < 0 then
    raise exception 'negative_stars';
  end if;

  update public.profiles
  set stars = after_value
  where id = p_target
  returning * into target_profile;

  insert into public.star_adjustments (
    admin_id,
    target_id,
    delta,
    before_stars,
    after_stars,
    reason
  )
  values (
    p_admin,
    p_target,
    p_delta,
    before_value,
    after_value,
    nullif(left(coalesce(p_reason, ''), 240), '')
  );

  return to_jsonb(target_profile);
end $$;

revoke all on public.superadmins from anon, authenticated;
revoke all on public.star_adjustments from anon, authenticated;
revoke execute on function public.admin_adjust_stars(uuid, uuid, int, text) from public;
grant execute on function public.admin_adjust_stars(uuid, uuid, int, text) to service_role;
