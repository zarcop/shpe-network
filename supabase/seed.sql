-- Fake people for local development and the staging project only. Production is never seeded.
-- 300 attendees with realistic spreads (a few big schools and a long tail, interns at sponsor companies, mixed
-- roots, ~10% recruiters) so the graph and search can be tested at the convention's real size.
-- Deterministic: the same 300 people on every run. Safe to rerun: everything is "on conflict do nothing".
-- Emails use the reserved .test domain, so nobody can sign in as a fake person; no LinkedIn links are generated,
-- because a made-up URL could belong to a real person.

-- A stable number in [0, 1) for person i and a purpose, so each choice is independent but repeatable.
create function pg_temp.rnd(i int, purpose text) returns double precision
language sql immutable as $$
  select ('x' || substr(md5(i || ':' || purpose), 1, 8))::bit(32)::bigint / 4294967296.0
$$;

-- Weighted choice: names[k] is picked with probability weights[k] / sum(weights).
create function pg_temp.pick(names text[], weights int[], r double precision) returns text
language plpgsql immutable as $$
declare
  target double precision := r * (select sum(w) from unnest(weights) as w);
  total int := 0;
begin
  for k in 1..cardinality(names) loop
    total := total + weights[k];
    if target < total then return names[k]; end if;
  end loop;
  return names[cardinality(names)];
end $$;

do $$
declare
  first_names text[] := array['Sofía','Mateo','Valentina','Santiago','Camila','Diego','Isabella','Andrés','Lucía',
    'Javier','Gabriela','Carlos','Daniela','Luis','Mariana','Alejandro','Natalia','José','Ana','Miguel','Paola',
    'Ricardo','Elena','Fernando','Adriana','Jorge','Carolina','Emilio','Ximena','Rafael','Valeria','Eduardo',
    'Andrea','Héctor','Beatriz','Iván','Renata','Óscar','Julia','Tomás'];
  last_names text[] := array['García','Rodríguez','Martínez','Hernández','López','González','Pérez','Sánchez',
    'Ramírez','Torres','Flores','Rivera','Gómez','Díaz','Cruz','Morales','Reyes','Ortiz','Gutiérrez','Chávez',
    'Ramos','Vargas','Castillo','Jiménez','Moreno','Romero','Herrera','Medina','Aguilar','Vega','Castro','Mendoza',
    'Ruiz','Álvarez','Delgado','Soto','Contreras','Guerrero','Navarro','Acosta'];

  schools text[] := array['University of Florida','Florida International University',
    'University of Puerto Rico at Mayagüez','Texas A&M University','The University of Texas at Austin',
    'University of Central Florida','The University of Texas at El Paso','Georgia Institute of Technology',
    'Arizona State University','Purdue University','University of Illinois Urbana-Champaign',
    'California State Polytechnic University, Pomona','University of Houston','The University of Texas at San Antonio',
    'University of California, Los Angeles','University of California, Berkeley','Florida State University',
    'University of Miami','New Jersey Institute of Technology','Rutgers University','University of Michigan',
    'Massachusetts Institute of Technology','Stanford University','University of California, San Diego',
    'San José State University','Miami Dade College','Polytechnic University of Puerto Rico'];
  school_weights int[] := array[12,10,9,8,7,7,6,5,5,4,4,4,4,3,3,3,3,2,2,2,2,2,2,2,2,2,2];

  majors text[] := array['Mechanical Engineering','Computer Science','Electrical Engineering','Computer Engineering',
    'Aerospace Engineering','Civil Engineering','Chemical Engineering','Industrial Engineering',
    'Biomedical Engineering','Data Science','Materials Science and Engineering','Environmental Engineering',
    'Physics','Mathematics'];
  major_weights int[] := array[22,18,14,12,8,7,7,6,4,3,2,2,1,1];

  companies text[] := array['Lockheed Martin','Boeing','RTX','Northrop Grumman','Google','Microsoft','Amazon',
    'Intel','Texas Instruments','GE Aerospace','NASA','Apple','Meta','SpaceX','Blue Origin','Tesla','Honeywell',
    'Chevron','ExxonMobil','Dow','Procter & Gamble','Johnson & Johnson','Ford Motor Company','General Motors',
    'Caterpillar','IBM','Capital One','JPMorgan Chase','Deloitte','Accenture','Bechtel','Kiewit'];
  company_weights int[] := array[9,8,7,6,6,6,6,5,5,5,5,4,4,4,3,3,3,3,3,3,3,2,3,3,2,2,2,2,3,3,2,2];

  countries text[] := array['Mexico','Puerto Rico','Colombia','Cuba','Dominican Republic','Venezuela','El Salvador',
    'Peru','United States','Guatemala','Ecuador','Honduras','Argentina','Nicaragua','Costa Rica','Panama',
    'Bolivia','Chile','Brazil','Spain'];
  country_weights int[] := array[35,15,8,7,6,5,5,4,5,3,3,3,2,2,1,1,1,1,1,1];

  i int;
  person uuid;
  recruiter boolean;
  school text;
  major text;
  employer text;
  hub_names text[];
  n_companies int;
  r double precision;
begin
  for i in 1..300 loop
    person := ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    recruiter := i % 10 = 0;
    school := pg_temp.pick(schools, school_weights, pg_temp.rnd(i, 'school'));
    major := pg_temp.pick(majors, major_weights, pg_temp.rnd(i, 'major'));
    employer := pg_temp.pick(companies, company_weights, pg_temp.rnd(i, 'company1'));

    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', person, 'authenticated', 'authenticated',
            'fake' || i || '@shpe-network.test', '', now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now())
    on conflict (id) do nothing;

    insert into public.profiles (id, full_name, headline, grad_year, visible)
    values (
      person,
      first_names[1 + floor(pg_temp.rnd(i, 'first') * cardinality(first_names))::int] || ' ' ||
        last_names[1 + floor(pg_temp.rnd(i, 'last') * cardinality(last_names))::int] ||
        -- Some people go by both family names.
        case when pg_temp.rnd(i, 'second last') < 0.15
             then ' ' || last_names[1 + floor(pg_temp.rnd(i, 'last2') * cardinality(last_names))::int] else '' end,
      case when recruiter then 'University Recruiter at ' || employer else major || ' student at ' || school end,
      case when recruiter then null else 2025 + floor(pg_temp.rnd(i, 'grad') * 5)::int end,
      pg_temp.rnd(i, 'hidden') >= 0.03
    )
    on conflict (id) do nothing;

    -- Everyone has a school and a major; some have a second of each (grad school, double majors).
    hub_names := array['school:' || school, 'major:' || major];
    if not recruiter and pg_temp.rnd(i, 'second school') < 0.12 then
      hub_names := hub_names || ('school:' || pg_temp.pick(schools, school_weights, pg_temp.rnd(i, 'school2')));
    end if;
    if pg_temp.rnd(i, 'second major') < 0.08 then
      hub_names := hub_names || ('major:' || pg_temp.pick(majors, major_weights, pg_temp.rnd(i, 'major2')));
    end if;

    -- Recruiters list their employer; students have had 0–3 internships.
    r := pg_temp.rnd(i, 'internships');
    n_companies := case when recruiter then 1 when r < 0.25 then 0 when r < 0.70 then 1 when r < 0.92 then 2 else 3 end;
    for k in 1..n_companies loop
      hub_names := hub_names ||
        ('company:' || case when k = 1 then employer
                            else pg_temp.pick(companies, company_weights, pg_temp.rnd(i, 'company' || k)) end);
    end loop;

    -- Roots are optional: most people add one, some add two.
    if pg_temp.rnd(i, 'roots') >= 0.18 then
      hub_names := hub_names || ('country:' || pg_temp.pick(countries, country_weights, pg_temp.rnd(i, 'root1')));
      if pg_temp.rnd(i, 'two roots') < 0.15 then
        hub_names := hub_names || ('country:' || pg_temp.pick(countries, country_weights, pg_temp.rnd(i, 'root2')));
      end if;
    end if;

    insert into public.profile_entities (profile_id, entity_id)
    select person, e.id
    from unnest(hub_names) as h
    join public.entities e on e.kind = split_part(h, ':', 1) and e.name = substr(h, strpos(h, ':') + 1)
    on conflict do nothing;
  end loop;
end $$;
