-- RLS policies run as the caller, so they cannot read superadmins directly
-- after client privileges on that table have been revoked.

create or replace function public.is_superadmin(p_user uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.superadmins sa
    where sa.user_id = p_user
  );
$$;

revoke all on function public.is_superadmin(uuid) from public;
grant execute on function public.is_superadmin(uuid) to authenticated;

drop policy if exists "superadmin hosts tournaments" on public.tournaments;
create policy "superadmin hosts tournaments" on public.tournaments
  for insert
  to authenticated
  with check (
    auth.uid() = host
    and public.is_superadmin(auth.uid())
  );
