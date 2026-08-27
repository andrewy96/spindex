-- Public lineup rows need a non-private display name for team events.
-- For registered team events, keep it synced from the registration team name.

alter table public.tournament_players
  add column if not exists lineup_name text;

alter table public.tournament_players
  drop constraint if exists tournament_players_lineup_name_length_check;

alter table public.tournament_players
  add constraint tournament_players_lineup_name_length_check
  check (lineup_name is null or char_length(lineup_name) <= 100);

update public.tournament_players player
set lineup_name = nullif(trim(registration.team_name), '')
from public.tournament_registrations registration
where player.tournament_id = registration.tournament_id
  and player.user_id = registration.user_id
  and nullif(trim(coalesce(registration.team_name, '')), '') is not null;

create or replace function public.sync_tournament_player_lineup_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_name text;
begin
  if tg_table_name = 'tournament_registrations' then
    if tg_op = 'DELETE' then
      update public.tournament_players
      set lineup_name = null
      where tournament_id = old.tournament_id
        and user_id = old.user_id;
      return old;
    end if;

    update public.tournament_players
    set lineup_name = nullif(trim(new.team_name), '')
    where tournament_id = new.tournament_id
      and user_id = new.user_id;
    return new;
  end if;

  if tg_table_name = 'tournament_players' and tg_op = 'INSERT' then
    select nullif(trim(registration.team_name), '')
    into next_name
    from public.tournament_registrations registration
    where registration.tournament_id = new.tournament_id
      and registration.user_id = new.user_id
    order by registration.updated_at desc
    limit 1;

    if next_name is not null and new.lineup_name is distinct from next_name then
      update public.tournament_players
      set lineup_name = next_name
      where tournament_id = new.tournament_id
        and user_id = new.user_id;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_tournament_player_lineup_name_from_registration
  on public.tournament_registrations;

create trigger sync_tournament_player_lineup_name_from_registration
  after insert or update of team_name or delete on public.tournament_registrations
  for each row
  execute function public.sync_tournament_player_lineup_name();

drop trigger if exists sync_tournament_player_lineup_name_after_player_insert
  on public.tournament_players;

create trigger sync_tournament_player_lineup_name_after_player_insert
  after insert on public.tournament_players
  for each row
  execute function public.sync_tournament_player_lineup_name();
