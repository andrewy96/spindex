-- Let hosts edit their own public event details through existing RLS policies.

grant update (
  title,
  city,
  venue,
  gather_at,
  fee_type,
  fee_amount,
  capacity,
  join_mode,
  note,
  status
) on public.gatherings to authenticated;

grant update (
  name,
  city,
  venue,
  starts_at,
  format,
  max_players,
  note,
  status
) on public.tournaments to authenticated;
