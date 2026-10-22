-- Local development data only: `supabase db reset` loads it; deploys never do.
-- Canonical hubs with the spellings resumes actually use, plus 60 fake people to draw a graph with.

insert into public.entities (kind, name, aliases) values
  ('school', 'University of Florida', '{uf,"univ. of florida"}'),
  ('school', 'Florida International University', '{fiu}'),
  ('school', 'University of Central Florida', '{ucf}'),
  ('school', 'The University of Texas at Austin', '{"ut austin","university of texas at austin",utexas}'),
  ('school', 'Texas A&M University', '{tamu,"texas a&m","texas a and m"}'),
  ('school', 'The University of Texas at El Paso', '{utep}'),
  ('school', 'University of Puerto Rico at Mayagüez', '{uprm,"upr mayaguez","university of puerto rico mayaguez"}'),
  ('school', 'Georgia Institute of Technology', '{"georgia tech",gatech}'),
  ('school', 'Purdue University', '{purdue}'),
  ('school', 'Arizona State University', '{asu}'),
  ('school', 'University of Illinois Urbana-Champaign', '{uiuc,"university of illinois"}'),
  ('school', 'Massachusetts Institute of Technology', '{mit}'),
  ('school', 'University of California, Berkeley', '{"uc berkeley",berkeley,cal}'),
  ('school', 'University of California, Los Angeles', '{ucla}'),
  ('school', 'California State Polytechnic University, Pomona', '{"cal poly pomona",cpp}'),

  ('company', 'Boeing', '{"the boeing company"}'),
  ('company', 'Lockheed Martin', '{lmco,"lockheed martin corporation"}'),
  ('company', 'Northrop Grumman', '{ngc}'),
  ('company', 'RTX', '{raytheon,"raytheon technologies","pratt & whitney","collins aerospace"}'),
  ('company', 'GE Aerospace', '{"general electric",ge}'),
  ('company', 'NASA', '{"nasa jpl",jpl,"jet propulsion laboratory"}'),
  ('company', 'Google', '{alphabet,"google llc"}'),
  ('company', 'Microsoft', '{msft,"microsoft corporation"}'),
  ('company', 'Amazon', '{aws,"amazon web services"}'),
  ('company', 'Apple', '{"apple inc."}'),
  ('company', 'Meta', '{facebook,"meta platforms"}'),
  ('company', 'Intel', '{"intel corporation"}'),
  ('company', 'Texas Instruments', '{ti}'),
  ('company', 'Chevron', '{}'),
  ('company', 'ExxonMobil', '{exxon,"exxon mobil"}'),
  ('company', 'Deloitte', '{}'),
  ('company', 'Accenture', '{}'),

  ('country', 'United States', '{usa,us,"united states of america"}'),
  ('country', 'Mexico', '{méxico}'),
  ('country', 'Puerto Rico', '{pr}'),
  ('country', 'Colombia', '{}'),
  ('country', 'Venezuela', '{}'),
  ('country', 'Cuba', '{}'),
  ('country', 'Dominican Republic', '{"república dominicana",rd}'),
  ('country', 'Peru', '{perú}'),
  ('country', 'Argentina', '{}'),
  ('country', 'El Salvador', '{}'),
  ('country', 'Guatemala', '{}'),
  ('country', 'Ecuador', '{}'),
  ('country', 'Brazil', '{brasil}'),
  ('country', 'Spain', '{españa}'),

  ('major', 'Mechanical Engineering', '{me,meche}'),
  ('major', 'Electrical Engineering', '{ee}'),
  ('major', 'Computer Engineering', '{ce,"comp e"}'),
  ('major', 'Computer Science', '{cs,"comp sci"}'),
  ('major', 'Aerospace Engineering', '{"aero engineering",aero}'),
  ('major', 'Civil Engineering', '{}'),
  ('major', 'Chemical Engineering', '{cheme,"che"}'),
  ('major', 'Industrial Engineering', '{ie,"industrial and systems engineering"}'),
  ('major', 'Biomedical Engineering', '{bme}'),
  ('major', 'Data Science', '{}');

-- 60 fake people, deterministic so the graph looks the same after every reset.
-- Every 6th person is a recruiter (by headline only); every 5th leaves country of origin blank.
with people as (
  select i,
         ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as id,
         (array['Sofía','Mateo','Valentina','Santiago','Camila','Diego','Isabella','Andrés','Lucía','Javier',
                'Gabriela','Carlos','Daniela','Luis','Mariana','Alejandro'])[1 + (i * 7) % 16] || ' ' ||
         (array['García','Rodríguez','Martínez','Hernández','López','González','Pérez','Sánchez','Ramírez',
                'Torres','Flores','Rivera','Gómez','Díaz','Cruz','Morales','Reyes'])[1 + (i * 11) % 17] as full_name,
         i % 6 = 0 as is_recruiter
  from generate_series(1, 60) as i
),
new_users as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
         'demo' || i || '@shpe-network.test', '', now(),
         '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from people
  returning id
)
insert into public.profiles (id, full_name, headline, grad_year)
select p.id, p.full_name,
       case when p.is_recruiter then 'University Recruiter' else 'Engineering student' end,
       case when not p.is_recruiter then 2025 + p.i % 4 end
from people p join new_users u on u.id = p.id;

with hubs as (
  select kind, array_agg(id order by id) as ids from public.entities group by kind
),
people as (
  select row_number() over (order by id) as i, id from public.profiles
)
insert into public.profile_entities (profile_id, entity_id)
select p.id, e.entity_id
from people p
cross join lateral (
  select h.ids[1 + (p.i * 3) % cardinality(h.ids)] from hubs h where h.kind = 'school'
  union select h.ids[1 + (p.i * 5) % cardinality(h.ids)] from hubs h where h.kind = 'major'
  union select h.ids[1 + (p.i * 2) % cardinality(h.ids)] from hubs h where h.kind = 'company'
  union select h.ids[1 + (p.i * 7 + 3) % cardinality(h.ids)] from hubs h where h.kind = 'company' and p.i % 3 = 0
  union select h.ids[1 + (p.i * 13) % cardinality(h.ids)] from hubs h where h.kind = 'country' and p.i % 5 <> 0
) as e(entity_id);
