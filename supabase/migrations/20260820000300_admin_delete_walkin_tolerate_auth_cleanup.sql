-- Keep walk-in deletion reliable for admin lists even when Supabase auth rows
-- have dependent records that cannot be removed by a simple direct delete.

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

  begin
    delete from auth.identities where user_id = p_target;
    delete from auth.sessions where user_id = p_target;
    delete from auth.refresh_tokens where user_id = p_target;
    delete from auth.mfa_factors where user_id = p_target;
    delete from auth.one_time_tokens where user_id = p_target;
    delete from auth.users where id = p_target;
  exception
    when undefined_table or undefined_column or foreign_key_violation then
      null;
  end;
end;
$$;

revoke execute on function public.admin_delete_walkin(uuid) from public;
grant execute on function public.admin_delete_walkin(uuid) to service_role;
