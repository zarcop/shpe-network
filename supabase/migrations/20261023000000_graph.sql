-- Everything the graph screen draws, in one call: the people you can see, the hubs they link to, and the links.
-- One jsonb value instead of three table reads, because ~2,000 links would pass PostgREST's 1,000-row page limit.
-- Security invoker: row level security drops hidden profiles and their links, and returns nothing to callers
-- without a profile. Links are [profile id, hub id] pairs to keep the payload small.
create function public.graph() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'headline', p.headline,
                                          'grad_year', p.grad_year, 'linkedin_url', p.linkedin_url)
                       order by p.full_name)
      from public.profiles p), '[]'),
    'hubs', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'name', e.name) order by e.id)
      from public.entities e
      where exists (select 1 from public.profile_entities pe where pe.entity_id = e.id)), '[]'),
    'links', coalesce((
      select jsonb_agg(jsonb_build_array(pe.profile_id, pe.entity_id))
      from public.profile_entities pe), '[]'))
$$;

revoke execute on function public.graph() from public, anon;
grant execute on function public.graph() to authenticated;
