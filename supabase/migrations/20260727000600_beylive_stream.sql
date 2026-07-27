-- BEYLIVE livestream embed settings.

alter table public.tournaments
  add column if not exists stream_url text,
  add column if not exists stream_title text,
  add column if not exists stream_enabled boolean not null default false;

alter table public.tournaments
  drop constraint if exists tournaments_stream_url_length_check;

alter table public.tournaments
  add constraint tournaments_stream_url_length_check
  check (stream_url is null or char_length(stream_url) <= 500);

alter table public.tournaments
  drop constraint if exists tournaments_stream_title_length_check;

alter table public.tournaments
  add constraint tournaments_stream_title_length_check
  check (stream_title is null or char_length(stream_title) <= 80);

grant update (stream_url, stream_title, stream_enabled) on public.tournaments
  to authenticated;
