-- Human-readable tournament URLs. UUID URLs continue to work in the app.

alter table public.tournaments
  add column if not exists slug text;

create or replace function public.slugify_tournament_name(value text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g')),
      ''
    ),
    'tournament'
  );
$$;

with bases as (
  select id, starts_at, public.slugify_tournament_name(name) as base_slug
  from public.tournaments
),
ranked as (
  select
    id,
    base_slug,
    row_number() over (partition by base_slug order by starts_at desc, id) as slug_no
  from bases
)
update public.tournaments t
set slug = case
  when ranked.slug_no = 1 then ranked.base_slug
  else ranked.base_slug || '-' || ranked.slug_no::text
end
from ranked
where t.id = ranked.id
  and (t.slug is null or t.slug = '');

create unique index if not exists tournaments_slug_key
  on public.tournaments (slug)
  where slug is not null;

create or replace function public.set_tournament_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_slug text;
  candidate text;
  suffix int := 2;
begin
  if tg_op = 'UPDATE' and new.name is not distinct from old.name and nullif(trim(coalesce(new.slug, '')), '') is not null then
    return new;
  end if;

  base_slug := public.slugify_tournament_name(new.name);
  candidate := base_slug;

  while exists (
    select 1
    from public.tournaments t
    where t.slug = candidate
      and t.id <> new.id
  ) loop
    candidate := base_slug || '-' || suffix::text;
    suffix := suffix + 1;
  end loop;

  new.slug := candidate;
  return new;
end;
$$;

drop trigger if exists set_tournament_slug_before_write on public.tournaments;

create trigger set_tournament_slug_before_write
  before insert or update of name, slug on public.tournaments
  for each row
  execute function public.set_tournament_slug();
