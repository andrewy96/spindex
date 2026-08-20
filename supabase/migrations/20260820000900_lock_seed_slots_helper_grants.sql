-- `beylive_seed_slots` is an internal helper for start_beylive, not a public
-- RPC endpoint.

revoke all on function public.beylive_seed_slots(int) from public;
revoke all on function public.beylive_seed_slots(int) from anon;
revoke all on function public.beylive_seed_slots(int) from authenticated;
grant execute on function public.beylive_seed_slots(int) to service_role;
