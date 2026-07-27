-- BEYLIVE per-stadium livestream embeds.

alter table public.tournaments
  add column if not exists stadium1_stream_url text,
  add column if not exists stadium1_stream_title text,
  add column if not exists stadium1_stream_enabled boolean not null default false,
  add column if not exists stadium2_stream_url text,
  add column if not exists stadium2_stream_title text,
  add column if not exists stadium2_stream_enabled boolean not null default false;

alter table public.tournaments
  drop constraint if exists tournaments_stadium1_stream_url_length_check;

alter table public.tournaments
  add constraint tournaments_stadium1_stream_url_length_check
  check (stadium1_stream_url is null or char_length(stadium1_stream_url) <= 500);

alter table public.tournaments
  drop constraint if exists tournaments_stadium1_stream_title_length_check;

alter table public.tournaments
  add constraint tournaments_stadium1_stream_title_length_check
  check (stadium1_stream_title is null or char_length(stadium1_stream_title) <= 80);

alter table public.tournaments
  drop constraint if exists tournaments_stadium2_stream_url_length_check;

alter table public.tournaments
  add constraint tournaments_stadium2_stream_url_length_check
  check (stadium2_stream_url is null or char_length(stadium2_stream_url) <= 500);

alter table public.tournaments
  drop constraint if exists tournaments_stadium2_stream_title_length_check;

alter table public.tournaments
  add constraint tournaments_stadium2_stream_title_length_check
  check (stadium2_stream_title is null or char_length(stadium2_stream_title) <= 80);

grant update (
  stadium1_stream_url,
  stadium1_stream_title,
  stadium1_stream_enabled,
  stadium2_stream_url,
  stadium2_stream_title,
  stadium2_stream_enabled
) on public.tournaments to authenticated;
