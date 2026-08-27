-- Explicitly mark whether a tournament is an individual-player event or a team event.
alter table public.tournaments
  add column if not exists event_type text;

update public.tournaments
set event_type = 'team'
where event_type is null
  and (
    format = 'partner'
    or lower(coalesce(registration_config->>'teamNameEnabled', 'false')) = 'true'
  );

update public.tournaments
set event_type = 'player'
where event_type is null;

alter table public.tournaments
  alter column event_type set default 'player',
  alter column event_type set not null;

alter table public.tournaments
  drop constraint if exists tournaments_event_type_check;

alter table public.tournaments
  add constraint tournaments_event_type_check
  check (event_type in ('player', 'team'));

grant update (event_type) on public.tournaments to authenticated;
