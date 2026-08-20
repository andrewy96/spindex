-- Superadmins remain implicit hosts, but tournament hosting can now be granted
-- to regular registered profiles without making them full superadmins.

alter table public.profiles
  add column if not exists approved_host boolean not null default false;

create or replace function public.can_host_tournament(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.superadmins sa
    where sa.user_id = uid
  ) or exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.approved_host is true
      and p.is_walkin is false
      and p.admin_deleted_at is null
  );
$$;

revoke execute on function public.can_host_tournament(uuid) from public;
grant execute on function public.can_host_tournament(uuid) to authenticated;

drop policy if exists "superadmin hosts tournaments" on public.tournaments;
drop policy if exists "approved hosts create tournaments" on public.tournaments;
create policy "approved hosts create tournaments" on public.tournaments
  for insert
  to authenticated
  with check (
    auth.uid() = host
    and public.can_host_tournament(auth.uid())
  );

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
        approved_host = false,
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
