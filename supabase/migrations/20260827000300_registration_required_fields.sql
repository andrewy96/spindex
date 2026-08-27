-- Registration rows must always keep the required public form details.
create or replace function public.enforce_tournament_registration_required_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
  team_enabled boolean;
begin
  select coalesce(registration_config, '{}'::jsonb)
  into cfg
  from public.tournaments
  where id = new.tournament_id;

  if nullif(trim(coalesce(new.blader_name, '')), '') is null then
    raise exception 'blader_name_required';
  end if;

  team_enabled := coalesce((cfg->>'teamNameEnabled')::boolean, true);
  if team_enabled is true and nullif(trim(coalesce(new.team_name, '')), '') is null then
    raise exception 'team_name_required';
  end if;

  if nullif(trim(coalesce(new.payment_proof_path, '')), '') is null then
    raise exception 'payment_proof_required';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_tournament_registration_required_fields
  on public.tournament_registrations;

create trigger enforce_tournament_registration_required_fields
  before insert or update on public.tournament_registrations
  for each row
  execute function public.enforce_tournament_registration_required_fields();

revoke execute on function public.enforce_tournament_registration_required_fields() from public;
