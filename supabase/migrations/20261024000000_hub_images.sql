-- Pictures for hubs in the graph: a website domain for colleges and companies (the app loads the logo from
-- Logo.dev by domain) and an ISO 3166-1 code for countries (the app ships the flags). Both stay null until known,
-- and the graph keeps the plain shape. Hubs people add get theirs from `make hub-logos` (D18), never from the app:
-- members still can't write to entities.

alter table public.entities
  add column domain text
    check (domain is null or (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' and kind in ('school', 'company'))),
  add column country_code text check (country_code is null or (country_code ~ '^[a-z]{2}$' and kind = 'country'));

update public.entities e set domain = v.domain
from (values
  ('school', 'University of Florida', 'ufl.edu'),
  ('school', 'Florida International University', 'fiu.edu'),
  ('school', 'University of Central Florida', 'ucf.edu'),
  ('school', 'The University of Texas at Austin', 'utexas.edu'),
  ('school', 'Texas A&M University', 'tamu.edu'),
  ('school', 'The University of Texas at El Paso', 'utep.edu'),
  ('school', 'University of Puerto Rico at Mayagüez', 'uprm.edu'),
  ('school', 'Georgia Institute of Technology', 'gatech.edu'),
  ('school', 'Purdue University', 'purdue.edu'),
  ('school', 'Arizona State University', 'asu.edu'),
  ('school', 'University of Illinois Urbana-Champaign', 'illinois.edu'),
  ('school', 'Massachusetts Institute of Technology', 'mit.edu'),
  ('school', 'University of California, Berkeley', 'berkeley.edu'),
  ('school', 'University of California, Los Angeles', 'ucla.edu'),
  ('school', 'California State Polytechnic University, Pomona', 'cpp.edu'),
  ('school', 'University of Houston', 'uh.edu'),
  ('school', 'The University of Texas at San Antonio', 'utsa.edu'),
  ('school', 'Florida State University', 'fsu.edu'),
  ('school', 'University of Miami', 'miami.edu'),
  ('school', 'New Jersey Institute of Technology', 'njit.edu'),
  ('school', 'Rutgers University', 'rutgers.edu'),
  ('school', 'University of Michigan', 'umich.edu'),
  ('school', 'Stanford University', 'stanford.edu'),
  ('school', 'University of California, San Diego', 'ucsd.edu'),
  ('school', 'San José State University', 'sjsu.edu'),
  ('school', 'Miami Dade College', 'mdc.edu'),
  ('school', 'Polytechnic University of Puerto Rico', 'pupr.edu'),
  ('company', 'Boeing', 'boeing.com'),
  ('company', 'Lockheed Martin', 'lockheedmartin.com'),
  ('company', 'Northrop Grumman', 'northropgrumman.com'),
  ('company', 'RTX', 'rtx.com'),
  ('company', 'GE Aerospace', 'geaerospace.com'),
  ('company', 'NASA', 'nasa.gov'),
  ('company', 'Google', 'google.com'),
  ('company', 'Microsoft', 'microsoft.com'),
  ('company', 'Amazon', 'amazon.com'),
  ('company', 'Apple', 'apple.com'),
  ('company', 'Meta', 'meta.com'),
  ('company', 'Intel', 'intel.com'),
  ('company', 'Texas Instruments', 'ti.com'),
  ('company', 'Chevron', 'chevron.com'),
  ('company', 'ExxonMobil', 'exxonmobil.com'),
  ('company', 'Deloitte', 'deloitte.com'),
  ('company', 'Accenture', 'accenture.com'),
  ('company', 'SpaceX', 'spacex.com'),
  ('company', 'Blue Origin', 'blueorigin.com'),
  ('company', 'Tesla', 'tesla.com'),
  ('company', 'Honeywell', 'honeywell.com'),
  ('company', 'Caterpillar', 'caterpillar.com'),
  ('company', 'Dow', 'dow.com'),
  ('company', 'Procter & Gamble', 'pg.com'),
  ('company', 'Johnson & Johnson', 'jnj.com'),
  ('company', 'Ford Motor Company', 'ford.com'),
  ('company', 'General Motors', 'gm.com'),
  ('company', 'IBM', 'ibm.com'),
  ('company', 'Capital One', 'capitalone.com'),
  ('company', 'JPMorgan Chase', 'jpmorganchase.com'),
  ('company', 'Bechtel', 'bechtel.com'),
  ('company', 'Kiewit', 'kiewit.com')
) as v (kind, name, domain)
where e.kind = v.kind and e.name = v.name;

update public.entities e set country_code = v.code
from (values
  ('United States', 'us'), ('Mexico', 'mx'), ('Puerto Rico', 'pr'), ('Colombia', 'co'), ('Venezuela', 've'),
  ('Cuba', 'cu'), ('Dominican Republic', 'do'), ('Peru', 'pe'), ('Argentina', 'ar'), ('El Salvador', 'sv'),
  ('Guatemala', 'gt'), ('Ecuador', 'ec'), ('Brazil', 'br'), ('Spain', 'es'), ('Honduras', 'hn'),
  ('Nicaragua', 'ni'), ('Costa Rica', 'cr'), ('Panama', 'pa'), ('Bolivia', 'bo'), ('Chile', 'cl'),
  ('Uruguay', 'uy'), ('Paraguay', 'py')
) as v (name, code)
where e.kind = 'country' and e.name = v.name;

-- Same as before, plus each hub's domain or country code.
create or replace function public.graph() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'headline', p.headline,
                                          'grad_year', p.grad_year, 'linkedin_url', p.linkedin_url)
                       order by p.full_name)
      from public.profiles p), '[]'),
    'hubs', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'name', e.name,
                                          'domain', e.domain, 'country_code', e.country_code) order by e.id)
      from public.entities e
      where exists (select 1 from public.profile_entities pe where pe.entity_id = e.id)), '[]'),
    'links', coalesce((
      select jsonb_agg(jsonb_build_array(pe.profile_id, pe.entity_id))
      from public.profile_entities pe), '[]'))
$$;
