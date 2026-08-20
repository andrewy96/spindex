-- Supabase auth.refresh_tokens.user_id is varchar, while public profile IDs are
-- uuid. Keep auth cleanup best-effort so it cannot block walk-in removal.

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

  begin
    delete from public.profiles where id = p_target;
  exception
    when foreign_key_violation then
      update public.profiles
      set
        admin_deleted_at = coalesce(admin_deleted_at, now()),
        handle = 'removed_' || left(replace(id::text, '-', ''), 12),
        display_name = 'Removed walk-in',
        avatar_url = null,
        city = null,
        stars = 0,
        beylive_judge = false
      where id = p_target;
      return;
  end;

  begin
    delete from auth.identities where user_id = p_target;
    delete from auth.sessions where user_id = p_target;
    delete from auth.refresh_tokens where user_id = p_target::text;
    delete from auth.mfa_factors where user_id = p_target;
    delete from auth.one_time_tokens where user_id = p_target;
    delete from auth.users where id = p_target;
  exception
    when others then
      null;
  end;
end;
$$;

revoke execute on function public.admin_delete_walkin(uuid) from public;
grant execute on function public.admin_delete_walkin(uuid) to service_role;
