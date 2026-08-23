-- Hosts can move an in-progress schedule when one physical stadium finishes
-- faster than another. The update is intentionally host-only and leaves
-- completed/cancelled matches locked.

create or replace function public.set_beylive_match_stadium(mid uuid, p_stadium_no int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.beylive_matches;
  stadium_count int;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;

  select * into m
  from public.beylive_matches
  where id = mid
  for update;

  if m is null then raise exception 'match_not_found'; end if;
  if m.status in ('completed', 'cancelled', 'bye') then raise exception 'match_locked'; end if;

  select greatest(1, least(16, coalesce(t.beylive_stadium_count, 2)))
  into stadium_count
  from public.tournaments t
  where t.id = m.tournament_id
    and t.host = auth.uid();

  if stadium_count is null then raise exception 'not_allowed'; end if;
  if p_stadium_no < 1 or p_stadium_no > stadium_count then raise exception 'invalid_stadium'; end if;

  update public.beylive_matches
  set table_no = p_stadium_no
  where id = mid;
end $$;

revoke execute on function public.set_beylive_match_stadium(uuid, int) from public, anon;
grant execute on function public.set_beylive_match_stadium(uuid, int) to authenticated;
