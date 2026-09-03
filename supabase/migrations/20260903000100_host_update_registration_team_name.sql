-- Let tournament hosts correct submitted team names without requiring
-- players to resubmit payment proof.

create or replace function public.host_update_tournament_registration_team_name(
  tid uuid,
  p_user_id uuid,
  p_team_name text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  cfg jsonb;
  clean_team text;
  team_enabled boolean;
  team_required boolean;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if p_user_id is null then raise exception 'player_required'; end if;

  select * into t
  from public.tournaments
  where id = tid
  for update;

  if t is null then raise exception 'tournament_not_found'; end if;
  if t.host <> auth.uid() then raise exception 'host_required'; end if;

  cfg := coalesce(t.registration_config, '{}'::jsonb);
  team_enabled := coalesce((cfg->>'teamNameEnabled')::boolean, true);
  team_required := team_enabled and coalesce((cfg->>'teamNameRequired')::boolean, team_enabled);
  clean_team := nullif(trim(coalesce(p_team_name, '')), '');

  if team_enabled is not true then
    raise exception 'team_name_disabled';
  end if;

  if team_required is true and clean_team is null then
    raise exception 'team_name_required';
  end if;

  if clean_team is not null and char_length(clean_team) > 100 then
    raise exception 'invalid_team_name';
  end if;

  if not exists (
    select 1
    from public.tournament_registrations
    where tournament_id = tid
      and user_id = p_user_id
  ) then
    raise exception 'registration_not_found';
  end if;

  update public.tournament_registrations
  set team_name = clean_team
  where tournament_id = tid
    and user_id = p_user_id;

  return coalesce(clean_team, '');
end;
$$;

revoke execute on function public.host_update_tournament_registration_team_name(uuid, uuid, text)
  from public, anon;
grant execute on function public.host_update_tournament_registration_team_name(uuid, uuid, text)
  to authenticated;
