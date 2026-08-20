-- Keep the host-check helper usable by authenticated RLS checks, but do not
-- expose it as an anonymous RPC endpoint.

revoke all on function public.can_host_tournament(uuid) from public;
revoke all on function public.can_host_tournament(uuid) from anon;
grant execute on function public.can_host_tournament(uuid) to authenticated;
