-- Saving a background with set_my_hubs: atomic replace, name resolution, limits and ownership.
-- Seed person 1 (00000000-0000-4000-8000-000000000001) has a profile and seeded hubs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function pg_temp.act_as(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true)
$$;

create function pg_temp.my_hubs() returns text[] language sql as $$
  select coalesce(array_agg(e.kind || ':' || e.name order by e.kind, e.name), '{}')
  from public.profile_entities pe join public.entities e on e.id = pe.entity_id
  where pe.profile_id = auth.uid()
$$;

-- Counted as the superuser before switching roles: person 2's edges must not change.
select set_config('test.person2_edges',
                  (select count(*) from public.profile_entities
                   where profile_id = '00000000-0000-4000-8000-000000000002')::text, true);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000999',
        'authenticated', 'authenticated', 'new@shpe-network.test', '', now(), now());

select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select ok(cardinality(pg_temp.my_hubs()) > 0, 'person 1 starts with seeded hubs');

select public.set_my_hubs('{"school": ["UF", "  "], "company": ["lmco", "SpaceX", "spacex"], "major": ["ME"]}');
select is(pg_temp.my_hubs(),
          array['company:Lockheed Martin', 'company:SpaceX', 'major:Mechanical Engineering', 'school:University of Florida'],
          'replaces the whole background, resolves aliases, skips blanks and duplicates');
select is((select count(*)::int from public.entities where kind = 'company' and lower(name) = 'spacex'), 1,
          'a new hub is created once');

select public.set_my_hubs('{}');
select is(pg_temp.my_hubs(), '{}'::text[], 'an empty background clears every hub');

select public.set_my_hubs('{"country": ["Colombia"]}');
select throws_ok($$select public.set_my_hubs('{"country": ["Mexico"], "planet": ["Mars"]}')$$, '22023', null,
                 'unknown hub kinds are refused');
select throws_ok($$select public.set_my_hubs('{"major": ["CS", "EE", "ME", "CE"]}')$$, '22023', null,
                 'too many entries of one kind are refused');
select throws_ok($$select public.set_my_hubs('{"school": "UF"}')$$, '22023', null, 'each kind must be a list');
select throws_ok($$select public.set_my_hubs('["UF"]')$$, '22023', null, 'the payload must be an object');
select is(pg_temp.my_hubs(), array['country:Colombia'], 'a refused save leaves the previous background intact');


reset role;
select is((select count(*)::int from public.profile_entities where profile_id = '00000000-0000-4000-8000-000000000002'),
          current_setting('test.person2_edges')::int, 'saving your background never touches anyone else''s');

select pg_temp.act_as('00000000-0000-4000-8000-000000000999');
select throws_ok($$select public.set_my_hubs('{"school": ["UF"]}')$$, '42501', null,
                 'you need a profile before saving a background');

select * from finish();
rollback;
