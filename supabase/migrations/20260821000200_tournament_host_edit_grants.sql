-- The host edit form updates the tournament's editable metadata in one PATCH.
-- RLS already limits updates to the tournament host; this grants the columns
-- that form is allowed to send so one missing privilege cannot reject the save.

grant update (
  name,
  city,
  venue,
  starts_at,
  format,
  format_config,
  max_players,
  target_score,
  beylive_stadium_count,
  note
) on public.tournaments to authenticated;
