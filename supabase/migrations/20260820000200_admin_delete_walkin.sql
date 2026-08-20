-- Superadmin cleanup for walk-ins. Anonymous walk-in users can hit auth-admin
-- delete edge cases, so remove their public profile first and then the auth row.

create or replace function public.admin_delete_walkin(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_profile public.profiles;
begin
  select * into target_profile
  from public.profiles
  where id = p_target
  for update;

  if target_profile is null then
    return;
  end if;

  if target_profile.is_walkin is not true then
    raise exception 'not_walkin';
  end if;

  delete from public.profile_private where id = p_target;
  delete from public.profiles where id = p_target;
  delete from auth.users where id = p_target;
end;
$$;

revoke execute on function public.admin_delete_walkin(uuid) from public;
grant execute on function public.admin_delete_walkin(uuid) to service_role;
