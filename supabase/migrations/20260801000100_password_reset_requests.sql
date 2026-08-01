-- Bladers sign in with a phone number and no email is ever collected, so a
-- self-serve reset has nowhere to send anything. Instead a blader files a
-- request, a superadmin verifies who is asking and issues a one-time code, and
-- the blader redeems that code to set a password of their own choosing.
--
-- The code is deliberately NOT a password. Setting the account's real password
-- to a value someone else has seen would leave a window where anyone knowing
-- the phone number could sign in. A code only works on the reset page, once,
-- before it expires.

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'issued', 'used', 'dismissed')),
  -- Set when a superadmin issues, cleared the moment it is redeemed.
  code text,
  expires_at timestamptz,
  -- Wrong guesses, so a code cannot be brute forced before it expires.
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  used_at timestamptz,
  handled_by uuid references public.profiles (id) on delete set null
);

-- One live request per blader. Asking again while one is open changes nothing,
-- and a spent or expired request no longer blocks a fresh one.
create unique index if not exists password_reset_requests_open_idx
  on public.password_reset_requests (profile_id)
  where status in ('pending', 'issued');

create index if not exists password_reset_requests_queue_idx
  on public.password_reset_requests (status, created_at desc);

alter table public.password_reset_requests enable row level security;

-- Deliberately no policies: every read and write goes through a server route
-- holding the service role key, which bypasses RLS. The codes never become
-- readable from the browser, not even to their owner.
revoke all on public.password_reset_requests from anon, authenticated;

-- auth.users is not reachable over PostgREST and profiles deliberately does not
-- store the phone number, so the reset routes need this to resolve one.
create or replace function public.profile_id_for_phone(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id
    from auth.users
   where phone = p_phone
     and deleted_at is null
   limit 1
$$;

revoke all on function public.profile_id_for_phone(text) from public, anon, authenticated;
