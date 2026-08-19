-- Store host-customized tournament format plans without changing the current
-- BEYLIVE execution engine. The existing `format` column remains the runnable
-- preset; `format_config` records the editable stage plan layered on top.

alter table public.tournaments
  add column if not exists format_config jsonb not null default '{}'::jsonb;

alter table public.tournaments
  drop constraint if exists tournaments_format_config_object_check;

alter table public.tournaments
  add constraint tournaments_format_config_object_check
  check (jsonb_typeof(format_config) = 'object');

grant insert (
  host,
  name,
  city,
  venue,
  starts_at,
  format,
  format_config,
  max_players,
  target_score,
  note
) on public.tournaments to authenticated;

grant update (format_config, target_score) on public.tournaments to authenticated;

comment on column public.tournaments.format_config is
  'Editable tournament format plan. The format column remains the active BEYLIVE engine preset.';
