-- Stadium assignment should fill active physical stadiums by playable round,
-- not by raw match_no. Group-stage match_no values jump by pool, so modulo
-- match_no can leave stadiums idle even when the host configured more.

create or replace function public.rebalance_beylive_match_round_stadiums(tid uuid, p_round_no int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stadium_count int;
begin
  select greatest(1, least(16, coalesce(t.beylive_stadium_count, 2)))
  into stadium_count
  from public.tournaments t
  where t.id = tid;

  if stadium_count is null then
    return;
  end if;

  with ranked as (
    select
      bm.id,
      ((row_number() over (
        order by
          case
            when bm.bracket ~ '^pool_[0-9]+$' then 0
            when bm.bracket = 'main' then 1
            when bm.bracket = 'losers' then 2
            when bm.bracket = 'grand' then 3
            else 4
          end,
          case
            when bm.bracket ~ '^pool_[0-9]+$' then substring(bm.bracket from 6)::int
            else 0
          end,
          bm.match_no
      ) - 1) % stadium_count) + 1 as next_table_no
    from public.beylive_matches bm
    where bm.tournament_id = tid
      and bm.round_no = p_round_no
      and bm.status in ('scheduled', 'live')
  )
  update public.beylive_matches bm
  set table_no = ranked.next_table_no
  from ranked
  where bm.id = ranked.id
    and bm.table_no is distinct from ranked.next_table_no;
end $$;

create or replace function public.rebalance_beylive_match_stadiums(tid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  round_row record;
begin
  for round_row in
    select distinct round_no
    from public.beylive_matches
    where tournament_id = tid
      and status in ('scheduled', 'live')
    order by round_no
  loop
    perform public.rebalance_beylive_match_round_stadiums(tid, round_row.round_no);
  end loop;
end $$;

create or replace function public.sync_beylive_stadium_rows(tid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stadium_count int;
begin
  select greatest(1, least(16, coalesce(t.beylive_stadium_count, 2)))
  into stadium_count
  from public.tournaments t
  where t.id = tid;

  if stadium_count is null then
    return;
  end if;

  insert into public.beylive_stadiums (tournament_id, stadium_no, label)
  select tid, n, 'Stadium ' || n
  from generate_series(1, stadium_count) as n
  on conflict (tournament_id, stadium_no) do nothing;

  delete from public.beylive_stadiums
  where tournament_id = tid and stadium_no > stadium_count;

  update public.beylive_judges
  set stadium_no = null
  where tournament_id = tid
    and stadium_no is not null
    and stadium_no > stadium_count;

  perform public.rebalance_beylive_match_stadiums(tid);
end $$;

create or replace function public.maintain_beylive_match_stadium_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rebalance_beylive_match_round_stadiums(new.tournament_id, new.round_no);
  return new;
end $$;

drop trigger if exists beylive_matches_stadium_after_insert on public.beylive_matches;
create trigger beylive_matches_stadium_after_insert
  after insert on public.beylive_matches
  for each row
  when (new.status in ('scheduled', 'live'))
  execute function public.maintain_beylive_match_stadium_assignment();

do $$
declare
  tournament_row record;
begin
  for tournament_row in
    select distinct tournament_id as id
    from public.beylive_matches
  loop
    perform public.rebalance_beylive_match_stadiums(tournament_row.id);
  end loop;
end $$;

revoke execute on function public.rebalance_beylive_match_round_stadiums(uuid, int) from public, anon, authenticated;
revoke execute on function public.rebalance_beylive_match_stadiums(uuid) from public, anon, authenticated;
revoke execute on function public.maintain_beylive_match_stadium_assignment() from public, anon, authenticated;
