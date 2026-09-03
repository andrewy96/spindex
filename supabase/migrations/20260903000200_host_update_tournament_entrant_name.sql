-- Let hosts rename registered teams and manual walk-in lineup entries from
-- the public lineup without broad table update grants.

create or replace function public.host_update_tournament_entrant_name(
  tid uuid,
  p_user_id uuid,
  p_name text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  cfg jsonb;
  clean_name text;
  team_enabled boolean;
  team_required boolean;
  existing_registration_id uuid;
  is_target_walkin boolean;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if p_user_id is null then raise exception 'player_required'; end if;

  select * into t
  from public.tournaments
  where id = tid
  for update;

  if t is null then raise exception 'tournament_not_found'; end if;
  if t.host <> auth.uid() then raise exception 'host_required'; end if;

  if not exists (
    select 1
    from public.tournament_players
    where tournament_id = tid
      and user_id = p_user_id
  ) then
    raise exception 'player_not_found';
  end if;

  cfg := coalesce(t.registration_config, '{}'::jsonb);
  team_enabled := coalesce((cfg->>'teamNameEnabled')::boolean, true);
  team_required := team_enabled and coalesce((cfg->>'teamNameRequired')::boolean, team_enabled);
  clean_name := nullif(trim(coalesce(p_name, '')), '');

  if team_enabled is not true then
    raise exception 'team_name_disabled';
  end if;

  if team_required is true and clean_name is null then
    raise exception 'team_name_required';
  end if;

  if clean_name is not null and char_length(clean_name) > 100 then
    raise exception 'invalid_team_name';
  end if;

  select id into existing_registration_id
  from public.tournament_registrations
  where tournament_id = tid
    and user_id = p_user_id;

  if existing_registration_id is not null then
    update public.tournament_registrations
    set team_name = clean_name
    where id = existing_registration_id;

    return coalesce(clean_name, '');
  end if;

  if clean_name is null then
    raise exception 'team_name_required';
  end if;

  update public.tournament_players
  set lineup_name = clean_name
  where tournament_id = tid
    and user_id = p_user_id;

  select coalesce(is_walkin, false) into is_target_walkin
  from public.profiles
  where id = p_user_id;

  if is_target_walkin is true then
    update public.profiles
    set display_name = clean_name
    where id = p_user_id
      and is_walkin is true;
  end if;

  return clean_name;
end;
$$;

revoke execute on function public.host_update_tournament_entrant_name(uuid, uuid, text)
  from public, anon;
grant execute on function public.host_update_tournament_entrant_name(uuid, uuid, text)
  to authenticated;
