-- GoTrue stores auth.users.phone without the leading plus ("60123456789"),
-- but the app normalizes to true E.164 ("+60123456789"). The first version of
-- this lookup compared them directly and so matched nobody: reset requests were
-- accepted and then silently dropped instead of reaching the admin queue.
-- Accept either shape rather than betting on one.
create or replace function public.profile_id_for_phone(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id
    from auth.users
   where phone in (p_phone, ltrim(p_phone, '+'))
     and deleted_at is null
   limit 1
$$;

revoke all on function public.profile_id_for_phone(text) from public, anon, authenticated;
