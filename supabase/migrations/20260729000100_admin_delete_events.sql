-- Superadmins can permanently remove a community event.
-- Hosts keep "cancel" (status flip); deleting the row also drops the lineup,
-- BEYLIVE matches and partner-battle state through the existing cascades.

create or replace function public.delete_tournament(tid uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if not exists (select 1 from public.superadmins where user_id = auth.uid()) then
    raise exception 'not_superadmin';
  end if;
  delete from public.tournaments where id = tid;
end $$;

create or replace function public.delete_gathering(gid uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if not exists (select 1 from public.superadmins where user_id = auth.uid()) then
    raise exception 'not_superadmin';
  end if;
  delete from public.gatherings where id = gid;
end $$;

revoke execute on function public.delete_tournament(uuid) from anon;
revoke execute on function public.delete_gathering(uuid) from anon;
grant execute on function public.delete_tournament(uuid) to authenticated;
grant execute on function public.delete_gathering(uuid) to authenticated;
