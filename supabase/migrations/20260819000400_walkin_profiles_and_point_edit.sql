-- Keep tournament walk-ins out of normal account economy and allow admins to
-- set larger OVERDRIVE point balances directly.

update public.profiles p
set is_walkin = true,
    stars = 0
from auth.users u
where u.id = p.id
  and coalesce(u.is_anonymous, false) = true;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_gender text;
  v_birthday date;
  v_is_walkin boolean := coalesce(new.is_anonymous, false);
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

  insert into public.profiles (id, handle, display_name, city, stars, is_walkin)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'handle', ''), 'blader_' || substr(replace(new.id::text, '-', ''), 1, 10)),
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), new.raw_user_meta_data->>'handle', 'Blader'),
    new.raw_user_meta_data->>'city',
    case when v_is_walkin then 0 else 1000 end,
    v_is_walkin
  );

  insert into public.profile_private (id, gender, birthday, age)
  values (new.id, v_gender, v_birthday, public.profile_age_from_birthday(v_birthday))
  on conflict (id) do update
    set gender = excluded.gender,
        birthday = excluded.birthday,
        age = excluded.age;

  return new;
end $$;

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
  after_big bigint;
  after_value int;
  target_profile profiles;
begin
  if not exists (select 1 from public.superadmins where user_id = p_admin) then
    raise exception 'not_superadmin';
  end if;

  if p_delta = 0 then
    raise exception 'invalid_delta';
  end if;

  select stars into before_value
  from public.profiles
  where id = p_target
  for update;

  if before_value is null then
    raise exception 'profile_not_found';
  end if;

  after_big := before_value::bigint + p_delta::bigint;
  if after_big < 0 or after_big > 2147483647 then
    raise exception 'invalid_points';
  end if;
  after_value := after_big::int;

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

revoke execute on function public.admin_adjust_stars(uuid, uuid, int, text) from public;
grant execute on function public.admin_adjust_stars(uuid, uuid, int, text) to service_role;
