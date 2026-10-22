-- Saves the caller's whole background (schools, companies, countries, majors) in one transaction, so a
-- profile is never left half-updated. Names resolve through entity_id_for ("UF" → University of Florida).
-- Security invoker: row level security still limits the caller to their own edges.
create function public.set_my_hubs(p_hubs jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  -- Generous for real people, small enough that one save can't flood the graph with junk hubs.
  v_limits constant jsonb := '{"school": 5, "company": 10, "country": 3, "major": 3}';
  v_kind text;
  v_names jsonb;
  v_ids bigint[] := '{}';
begin
  if jsonb_typeof(p_hubs) is distinct from 'object' then
    raise exception 'hubs must be an object' using errcode = '22023';
  end if;

  for v_kind, v_names in select * from jsonb_each(p_hubs) loop
    if not v_limits ? v_kind then
      raise exception 'unknown hub kind %', v_kind using errcode = '22023';
    end if;
    if jsonb_typeof(v_names) <> 'array' then
      raise exception '% must be a list of names', v_kind using errcode = '22023';
    end if;
    if jsonb_array_length(v_names) > (v_limits->>v_kind)::int then
      raise exception 'at most % % entries', v_limits->>v_kind, v_kind using errcode = '22023';
    end if;
    v_ids := v_ids || array(
      select public.entity_id_for(v_kind, n)
      from jsonb_array_elements_text(v_names) as n
      where btrim(n) <> ''
    );
  end loop;

  delete from public.profile_entities where profile_id = auth.uid();
  insert into public.profile_entities (profile_id, entity_id)
  select distinct auth.uid(), id from unnest(v_ids) as id;
end $$;

revoke execute on function public.set_my_hubs(jsonb) from public, anon;
grant execute on function public.set_my_hubs(jsonb) to authenticated;
