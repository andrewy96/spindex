-- Team events must collect all three blader names:
-- the logged-in captain as Blader 1, plus required Blader 2 and Blader 3 fields.

with target as (
  select
    id,
    coalesce(registration_config, '{}'::jsonb) as cfg
  from public.tournaments
  where event_type = 'team'
     or format = 'partner'
     or coalesce((registration_config->>'teamNameEnabled')::boolean, false) is true
),
merged as (
  select
    id,
    cfg,
    (
      select coalesce(jsonb_agg(field order by sort_no), '[]'::jsonb)
      from (
        select sort_no, field
        from (
          values
            (1, jsonb_build_object('id', 'blader_2_name', 'label', 'Blader 2 name', 'required', true)),
            (2, jsonb_build_object('id', 'blader_3_name', 'label', 'Blader 3 name', 'required', true))
          union all
          select
            10 + existing.ordinality::int,
            existing.value
          from jsonb_array_elements(coalesce(cfg->'customFields', '[]'::jsonb)) with ordinality as existing(value, ordinality)
          where coalesce(existing.value->>'id', '') not in ('blader_2_name', 'blader_3_name')
            and lower(regexp_replace(coalesce(existing.value->>'label', ''), '[^a-z0-9]+', '', 'g'))
              not in ('blader2name', 'blader3name')
        ) combined(sort_no, field)
        order by sort_no
        limit 6
      ) limited
    ) as custom_fields
  from target
)
update public.tournaments t
set registration_config =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          merged.cfg,
          '{teamNameEnabled}',
          'true'::jsonb,
          true
        ),
        '{teamNameRequired}',
        'true'::jsonb,
        true
      ),
      '{paymentProofRequired}',
      'true'::jsonb,
      true
    ),
    '{customFields}',
    merged.custom_fields,
    true
  )
from merged
where t.id = merged.id;

create or replace function public.enforce_tournament_registration_required_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
  team_enabled boolean;
  custom_field jsonb;
  custom_field_id text;
  custom_field_label text;
begin
  select coalesce(registration_config, '{}'::jsonb)
  into cfg
  from public.tournaments
  where id = new.tournament_id;

  if nullif(trim(coalesce(new.blader_name, '')), '') is null then
    raise exception 'blader_name_required';
  end if;

  team_enabled := coalesce((cfg->>'teamNameEnabled')::boolean, true);
  if team_enabled is true and nullif(trim(coalesce(new.team_name, '')), '') is null then
    raise exception 'team_name_required';
  end if;

  if nullif(trim(coalesce(new.payment_proof_path, '')), '') is null then
    raise exception 'payment_proof_required';
  end if;

  for custom_field in
    select value
    from jsonb_array_elements(coalesce(cfg->'customFields', '[]'::jsonb))
    where coalesce((value->>'required')::boolean, false) is true
  loop
    custom_field_id := nullif(trim(coalesce(custom_field->>'id', '')), '');
    custom_field_label := coalesce(nullif(trim(coalesce(custom_field->>'label', '')), ''), custom_field_id, 'Question');

    if custom_field_id is not null
       and nullif(trim(coalesce(new.custom_answers->>custom_field_id, '')), '') is null then
      raise exception 'custom_field_required:%', custom_field_label;
    end if;
  end loop;

  return new;
end;
$$;
