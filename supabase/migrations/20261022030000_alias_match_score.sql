-- An exact alias ("uprm", "comp sci") is a certain match, but its text similarity to the official name
-- is low, so callers that keep matches above a score threshold dropped it. Score alias matches as 1.
create or replace function public.similar_entities(p_kind text, p_name text)
returns table (id bigint, name text, score real)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.name,
         case when lower(btrim(p_name)) = any(e.aliases) then 1
              else extensions.similarity(lower(e.name), lower(p_name)) end
  from public.entities e
  where e.kind = p_kind
    and (extensions.similarity(lower(e.name), lower(p_name)) > 0.3 or lower(btrim(p_name)) = any(e.aliases))
  order by 3 desc
  limit 5
$$;
