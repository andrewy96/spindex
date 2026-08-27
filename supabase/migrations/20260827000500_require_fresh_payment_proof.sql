-- Every registration submit/update must include a newly uploaded payment proof.
create or replace function public.submit_tournament_registration(
  tid uuid,
  p_email text,
  p_contact_number text,
  p_team_name text default null,
  p_payment_proof_path text default null,
  p_custom_answers jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  p public.profiles;
  cfg jsonb;
  clean_email text;
  clean_blader text;
  clean_contact text;
  clean_team text;
  proof_path text;
  joined_count int;
  existing_status text;
  next_status text;
  next_seed int;
  team_enabled boolean;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;

  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.status <> 'open' then raise exception 'tournament_not_open'; end if;

  cfg := coalesce(t.registration_config, '{}'::jsonb);
  if coalesce((cfg->>'enabled')::boolean, true) is not true then
    raise exception 'registration_closed';
  end if;

  select * into p from public.profiles where id = auth.uid();
  if p is null then raise exception 'profile_not_found'; end if;
  if p.is_walkin is true or p.admin_deleted_at is not null then
    raise exception 'invalid_profile';
  end if;

  clean_email := lower(nullif(trim(p_email), ''));
  clean_blader := coalesce(nullif(trim(coalesce(p.display_name, '')), ''), nullif(trim(coalesce(p.handle, '')), ''));
  clean_contact := nullif(trim(p_contact_number), '');
  clean_team := nullif(trim(coalesce(p_team_name, '')), '');
  proof_path := nullif(trim(coalesce(p_payment_proof_path, '')), '');
  team_enabled := coalesce((cfg->>'teamNameEnabled')::boolean, true);

  if clean_blader is null then
    raise exception 'blader_name_required';
  end if;

  if clean_email is null
     or clean_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or char_length(clean_email) > 254 then
    raise exception 'invalid_email';
  end if;

  if clean_contact is null or char_length(clean_contact) < 6 or char_length(clean_contact) > 32 then
    raise exception 'invalid_contact_number';
  end if;

  if team_enabled is true and clean_team is null then
    raise exception 'team_name_required';
  end if;
  if clean_team is not null and char_length(clean_team) > 100 then
    raise exception 'invalid_team_name';
  end if;
  if team_enabled is not true then
    clean_team := null;
  end if;

  if proof_path is null then
    raise exception 'payment_proof_required';
  end if;
  if proof_path !~ ('^' || tid::text || '/' || auth.uid()::text || '/[^/]+$') then
    raise exception 'invalid_payment_proof';
  end if;

  if jsonb_typeof(coalesce(p_custom_answers, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_custom_answers';
  end if;

  select status into existing_status
  from public.tournament_players
  where tournament_id = tid and user_id = auth.uid();

  select count(*) into joined_count
  from public.tournament_players
  where tournament_id = tid and status = 'joined';

  if existing_status is null and joined_count >= t.max_players then
    raise exception 'tournament_full';
  end if;

  insert into public.tournament_registrations (
    tournament_id,
    user_id,
    email,
    blader_name,
    contact_number,
    team_name,
    payment_proof_path,
    custom_answers,
    status
  )
  values (
    tid,
    auth.uid(),
    clean_email,
    clean_blader,
    clean_contact,
    clean_team,
    proof_path,
    coalesce(p_custom_answers, '{}'::jsonb),
    'submitted'
  )
  on conflict (tournament_id, user_id) do update
  set
    email = excluded.email,
    blader_name = excluded.blader_name,
    contact_number = excluded.contact_number,
    team_name = excluded.team_name,
    payment_proof_path = excluded.payment_proof_path,
    custom_answers = excluded.custom_answers,
    status = 'submitted';

  if existing_status is not null then
    return existing_status;
  end if;

  next_status := 'joined';
  next_seed := joined_count + 1;

  insert into public.tournament_players (tournament_id, user_id, status, seed)
  values (tid, auth.uid(), next_status, next_seed);

  return next_status;
end;
$$;

create or replace function public.host_submit_tournament_registration(
  tid uuid,
  p_user_id uuid,
  p_email text,
  p_contact_number text,
  p_team_name text default null,
  p_payment_proof_path text default null,
  p_custom_answers jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tournaments;
  p public.profiles;
  cfg jsonb;
  clean_email text;
  clean_blader text;
  clean_contact text;
  clean_team text;
  proof_path text;
  joined_count int;
  existing_status text;
  next_status text;
  next_seed int;
  team_enabled boolean;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if p_user_id is null then raise exception 'player_required'; end if;

  select * into t from public.tournaments where id = tid for update;
  if t is null then raise exception 'tournament_not_found'; end if;
  if t.host <> auth.uid() then raise exception 'host_required'; end if;
  if t.status <> 'open' then raise exception 'tournament_not_open'; end if;

  cfg := coalesce(t.registration_config, '{}'::jsonb);
  if coalesce((cfg->>'enabled')::boolean, true) is not true then
    raise exception 'registration_closed';
  end if;

  select * into p from public.profiles where id = p_user_id;
  if p is null then raise exception 'profile_not_found'; end if;
  if p.is_walkin is true or p.admin_deleted_at is not null then
    raise exception 'invalid_profile';
  end if;

  clean_email := lower(nullif(trim(p_email), ''));
  clean_blader := coalesce(nullif(trim(coalesce(p.display_name, '')), ''), nullif(trim(coalesce(p.handle, '')), ''));
  clean_contact := nullif(trim(p_contact_number), '');
  clean_team := nullif(trim(coalesce(p_team_name, '')), '');
  proof_path := nullif(trim(coalesce(p_payment_proof_path, '')), '');
  team_enabled := coalesce((cfg->>'teamNameEnabled')::boolean, true);

  if clean_blader is null then
    raise exception 'blader_name_required';
  end if;

  if clean_email is null
     or clean_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or char_length(clean_email) > 254 then
    raise exception 'invalid_email';
  end if;

  if clean_contact is null or char_length(clean_contact) < 6 or char_length(clean_contact) > 32 then
    raise exception 'invalid_contact_number';
  end if;

  if team_enabled is true and clean_team is null then
    raise exception 'team_name_required';
  end if;
  if clean_team is not null and char_length(clean_team) > 100 then
    raise exception 'invalid_team_name';
  end if;
  if team_enabled is not true then
    clean_team := null;
  end if;

  if proof_path is null then
    raise exception 'payment_proof_required';
  end if;
  if proof_path !~ ('^' || tid::text || '/' || p_user_id::text || '/[^/]+$') then
    raise exception 'invalid_payment_proof';
  end if;

  if jsonb_typeof(coalesce(p_custom_answers, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_custom_answers';
  end if;

  select status into existing_status
  from public.tournament_players
  where tournament_id = tid and user_id = p_user_id;

  select count(*) into joined_count
  from public.tournament_players
  where tournament_id = tid and status = 'joined';

  if existing_status is null and joined_count >= t.max_players then
    raise exception 'tournament_full';
  end if;

  insert into public.tournament_registrations (
    tournament_id,
    user_id,
    email,
    blader_name,
    contact_number,
    team_name,
    payment_proof_path,
    custom_answers,
    status
  )
  values (
    tid,
    p_user_id,
    clean_email,
    clean_blader,
    clean_contact,
    clean_team,
    proof_path,
    coalesce(p_custom_answers, '{}'::jsonb),
    'submitted'
  )
  on conflict (tournament_id, user_id) do update
  set
    email = excluded.email,
    blader_name = excluded.blader_name,
    contact_number = excluded.contact_number,
    team_name = excluded.team_name,
    payment_proof_path = excluded.payment_proof_path,
    custom_answers = excluded.custom_answers,
    status = 'submitted';

  if existing_status is not null then
    return existing_status;
  end if;

  next_status := 'joined';
  next_seed := joined_count + 1;

  insert into public.tournament_players (tournament_id, user_id, status, seed)
  values (tid, p_user_id, next_status, next_seed);

  return next_status;
end;
$$;

revoke execute on function public.submit_tournament_registration(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.submit_tournament_registration(uuid, text, text, text, text, jsonb) to authenticated;

revoke execute on function public.host_submit_tournament_registration(uuid, uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.host_submit_tournament_registration(uuid, uuid, text, text, text, text, jsonb) to authenticated;
