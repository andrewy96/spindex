-- Superadmins can grant a registered profile global BEYLIVE judge access.
-- Tournament-scoped judge rows still work; this adds a reusable profile
-- entitlement for trusted judges who should be able to score any BEYLIVE.

alter table public.profiles
  add column if not exists beylive_judge boolean not null default false;

create or replace function public.can_manage_beylive(tid uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.tournaments t
    where t.id = tid and t.host = uid
  ) or exists (
    select 1
    from public.beylive_judges j
    where j.tournament_id = tid and j.user_id = uid
  ) or exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.beylive_judge is true
      and p.is_walkin is false
  );
$$;

revoke execute on function public.can_manage_beylive(uuid, uuid) from public;
grant execute on function public.can_manage_beylive(uuid, uuid) to authenticated;
