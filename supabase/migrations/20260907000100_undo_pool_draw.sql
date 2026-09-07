-- Clear the entire draw atomically, only while the host can still edit the lineup.
create or replace function public.undo_group_stage_pool_draw(tid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.host <> auth.uid() then raise exception 'not_allowed'; end if;
  if t.format not in ('group_stage', 'swiss') then raise exception 'wrong_format'; end if;
  if t.status <> 'open' then raise exception 'tournament_not_open'; end if;
  if exists (select 1 from public.beylive_matches where tournament_id = tid) then
    raise exception 'cannot_undo_pools_after_matches_generated';
  end if;

  update public.tournament_players
  set pool_no = null
  where tournament_id = tid and pool_no is not null;
end;
$$;

revoke execute on function public.undo_group_stage_pool_draw(uuid) from public, anon;
grant execute on function public.undo_group_stage_pool_draw(uuid) to authenticated;
