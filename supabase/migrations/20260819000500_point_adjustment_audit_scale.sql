-- OVERDRIVE point balances can be edited by exact value, so the audit table
-- must accept larger deltas than the old star-era +/-1000 shortcut controls.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'star_adjustments'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%delta%'
      and pg_get_constraintdef(c.oid) like '%1000%'
  loop
    execute format('alter table public.star_adjustments drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.star_adjustments
  drop constraint if exists star_adjustments_delta_check;

alter table public.star_adjustments
  add constraint star_adjustments_delta_check check (delta <> 0);
