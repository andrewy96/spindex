-- Tournament registration forms with payment-proof attachments.
-- Registration data is private to the submitting user and tournament host.

alter table public.tournaments
  add column if not exists registration_config jsonb not null default jsonb_build_object(
    'enabled', true,
    'teamNameEnabled', true,
    'teamNameRequired', true,
    'paymentInstructions', 'TNG Payment- 0126262802 (ANDREW YAP JIUN HERNG)',
    'paymentRemarkHint', 'MENTION TEAM NAME - EXAMPLE Team main maju - SPINDEX team event',
    'paymentProofRequired', true,
    'customFields', '[]'::jsonb
  );

alter table public.tournaments
  drop constraint if exists tournaments_registration_config_object_check;

alter table public.tournaments
  add constraint tournaments_registration_config_object_check
  check (jsonb_typeof(registration_config) = 'object');

grant update (registration_config) on public.tournaments to authenticated;

create table if not exists public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  blader_name text not null check (char_length(blader_name) between 1 and 80),
  contact_number text not null check (char_length(contact_number) between 6 and 32),
  team_name text check (team_name is null or char_length(team_name) <= 100),
  payment_proof_path text check (payment_proof_path is null or char_length(payment_proof_path) <= 512),
  custom_answers jsonb not null default '{}'::jsonb,
  status text not null default 'submitted' check (status in ('submitted', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

alter table public.tournament_registrations enable row level security;

drop policy if exists "registrations visible to owner and host" on public.tournament_registrations;
create policy "registrations visible to owner and host" on public.tournament_registrations
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and t.host = auth.uid()
    )
  );

grant select on public.tournament_registrations to authenticated;

create index if not exists tournament_registrations_tournament_idx
  on public.tournament_registrations (tournament_id, created_at);

create index if not exists tournament_registrations_user_idx
  on public.tournament_registrations (user_id, created_at desc);

create or replace function public.touch_tournament_registrations_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_tournament_registrations_updated_at on public.tournament_registrations;
create trigger touch_tournament_registrations_updated_at
  before update on public.tournament_registrations
  for each row execute function public.touch_tournament_registrations_updated_at();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'tournament-registration-proofs',
  'tournament-registration-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "registration proofs visible to owner and host" on storage.objects;
create policy "registration proofs visible to owner and host" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'tournament-registration-proofs'
    and (
      split_part(storage.objects.name, '/', 2) = auth.uid()::text
      or case
        when split_part(storage.objects.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then exists (
            select 1
            from public.tournaments t
            where t.id = split_part(storage.objects.name, '/', 1)::uuid
              and t.host = auth.uid()
          )
        else false
      end
    )
  );

drop policy if exists "users upload own registration proofs" on storage.objects;
create policy "users upload own registration proofs" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'tournament-registration-proofs'
    and split_part(storage.objects.name, '/', 2) = auth.uid()::text
    and case
      when split_part(storage.objects.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then exists (
          select 1
          from public.tournaments t
          where t.id = split_part(storage.objects.name, '/', 1)::uuid
            and t.status = 'open'
        )
      else false
    end
  );

drop policy if exists "hosts upload registration proofs" on storage.objects;
create policy "hosts upload registration proofs" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'tournament-registration-proofs'
    and case
      when split_part(storage.objects.name, '/', 1) ~* '^[0-9a-f-]{36}$'
        then exists (
          select 1
          from public.tournaments t
          where t.id = split_part(storage.objects.name, '/', 1)::uuid
            and t.host = auth.uid()
            and t.status = 'open'
        )
      else false
    end
  );

drop policy if exists "users delete own registration proofs" on storage.objects;
create policy "users delete own registration proofs" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'tournament-registration-proofs'
    and split_part(storage.objects.name, '/', 2) = auth.uid()::text
  );

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
  clean_contact text;
  clean_team text;
  proof_path text;
  joined_count int;
  existing_status text;
  next_status text;
  next_seed int;
  team_enabled boolean;
  team_required boolean;
  proof_required boolean;
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
  clean_contact := nullif(trim(p_contact_number), '');
  clean_team := nullif(trim(coalesce(p_team_name, '')), '');
  proof_path := nullif(trim(coalesce(p_payment_proof_path, '')), '');
  team_enabled := coalesce((cfg->>'teamNameEnabled')::boolean, true);
  team_required := coalesce((cfg->>'teamNameRequired')::boolean, true);
  proof_required := coalesce((cfg->>'paymentProofRequired')::boolean, true);

  if clean_email is null
     or clean_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or char_length(clean_email) > 254 then
    raise exception 'invalid_email';
  end if;

  if clean_contact is null or char_length(clean_contact) < 6 or char_length(clean_contact) > 32 then
    raise exception 'invalid_contact_number';
  end if;

  if team_enabled is true and team_required is true and clean_team is null then
    raise exception 'team_name_required';
  end if;
  if clean_team is not null and char_length(clean_team) > 100 then
    raise exception 'invalid_team_name';
  end if;
  if team_enabled is not true then
    clean_team := null;
  end if;

  if proof_required is true and proof_path is null then
    raise exception 'payment_proof_required';
  end if;
  if proof_path is not null and proof_path !~ ('^' || tid::text || '/' || auth.uid()::text || '/[^/]+$') then
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
    coalesce(nullif(trim(p.display_name), ''), p.handle, 'Blader'),
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
    payment_proof_path = coalesce(excluded.payment_proof_path, public.tournament_registrations.payment_proof_path),
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

revoke execute on function public.submit_tournament_registration(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.submit_tournament_registration(uuid, text, text, text, text, jsonb) to authenticated;

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
  clean_contact text;
  clean_team text;
  proof_path text;
  joined_count int;
  existing_status text;
  next_status text;
  next_seed int;
  team_enabled boolean;
  team_required boolean;
  proof_required boolean;
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
  clean_contact := nullif(trim(p_contact_number), '');
  clean_team := nullif(trim(coalesce(p_team_name, '')), '');
  proof_path := nullif(trim(coalesce(p_payment_proof_path, '')), '');
  team_enabled := coalesce((cfg->>'teamNameEnabled')::boolean, true);
  team_required := coalesce((cfg->>'teamNameRequired')::boolean, true);
  proof_required := coalesce((cfg->>'paymentProofRequired')::boolean, true);

  if clean_email is null
     or clean_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or char_length(clean_email) > 254 then
    raise exception 'invalid_email';
  end if;

  if clean_contact is null or char_length(clean_contact) < 6 or char_length(clean_contact) > 32 then
    raise exception 'invalid_contact_number';
  end if;

  if team_enabled is true and team_required is true and clean_team is null then
    raise exception 'team_name_required';
  end if;
  if clean_team is not null and char_length(clean_team) > 100 then
    raise exception 'invalid_team_name';
  end if;
  if team_enabled is not true then
    clean_team := null;
  end if;

  if proof_required is true and proof_path is null then
    raise exception 'payment_proof_required';
  end if;
  if proof_path is not null and proof_path !~ ('^' || tid::text || '/' || p_user_id::text || '/[^/]+$') then
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
    coalesce(nullif(trim(p.display_name), ''), p.handle, 'Blader'),
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
    payment_proof_path = coalesce(excluded.payment_proof_path, public.tournament_registrations.payment_proof_path),
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

revoke execute on function public.host_submit_tournament_registration(uuid, uuid, text, text, text, text, jsonb) from public;
grant execute on function public.host_submit_tournament_registration(uuid, uuid, text, text, text, text, jsonb) to authenticated;
