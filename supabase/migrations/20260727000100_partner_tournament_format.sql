-- Allow the "partner" (2-blader random-team) format for community tournaments.
-- Non-destructive: only widens the allowed set on the format CHECK constraint.

alter table public.tournaments
  drop constraint if exists tournaments_format_check;

alter table public.tournaments
  add constraint tournaments_format_check check (
    format in (
      'single_elimination',
      'double_elimination',
      'round_robin',
      'swiss',
      'free_for_all',
      'leaderboard',
      'partner'
    )
  );
