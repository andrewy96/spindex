-- Hosts need to shuffle their own list when someone drops out.
-- Members can still only add or remove themselves; this is host-only.

create or replace function public.set_gathering_member_status(
  gid uuid,
  member uuid,
  new_status text
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  g public.gatherings;
  joined_count int;
  current_status text;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if new_status not in ('joined', 'waitlisted') then raise exception 'invalid_status'; end if;

  select * into g from public.gatherings where id = gid for update;
  if g is null then raise exception 'gathering_not_found'; end if;
  if g.host <> auth.uid() then raise exception 'host_only'; end if;

  select status into current_status
  from public.gathering_members
  where gathering_id = gid and user_id = member;
  if current_status is null then raise exception 'not_a_member'; end if;
  if current_status = new_status then return current_status; end if;

  -- Promoting must not overfill the gathering; the host frees a spot first.
  if new_status = 'joined' and g.capacity is not null then
    select count(*) into joined_count
    from public.gathering_members
    where gathering_id = gid and status = 'joined';
    if joined_count >= g.capacity then raise exception 'gathering_full'; end if;
  end if;

  update public.gathering_members
  set status = new_status
  where gathering_id = gid and user_id = member;

  return new_status;
end $$;

revoke execute on function public.set_gathering_member_status(uuid, uuid, text) from anon;
grant execute on function public.set_gathering_member_status(uuid, uuid, text) to authenticated;
