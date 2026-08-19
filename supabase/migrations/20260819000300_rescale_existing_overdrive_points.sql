-- One-time conversion for profiles that still have the old small star balance.
-- Fresh OVERDRIVE signups start at 1000 points, so only balances below that
-- threshold are treated as pre-OVERDRIVE values and multiplied by 100.

create table if not exists public.overdrive_economy_flags (
  key text primary key,
  applied_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from public.overdrive_economy_flags
    where key = 'profile_points_x100_20260819'
  ) then
    update public.profiles
    set stars = stars * 100
    where stars < 1000;

    insert into public.overdrive_economy_flags (key)
    values ('profile_points_x100_20260819');
  end if;
end $$;
