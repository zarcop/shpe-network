-- Row level security and LLM quotas, tested against the seed data.
-- Seed ids: person i is 00000000-0000-4000-8000-<i padded to 12>; every 6th has a recruiter headline,
-- every 5th has no country. So 1, 2 and 6 all have a country.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

create function pg_temp.act_as(p_n int) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims',
                    json_build_object('sub', '00000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'),
                                      'role', 'authenticated')::text, true)
$$;

create function pg_temp.person(p_n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

-- A signed-up user who hasn't created a profile yet.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000999',
        'authenticated', 'authenticated', 'new@shpe-network.test', '', now(), now());

-- ───────── Anonymous ─────────
set local role anon;
select throws_ok('select count(*) from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select count(*) from public.profile_entities', '42501', null, 'anon cannot read edges');
select throws_ok($$select public.consume_llm_quota('search')$$, '42501', null, 'anon cannot spend quota');
reset role;

-- ───────── Signed-in view: the same for everyone ─────────
-- Counted before switching roles, so local sign-ups on top of the seed don't break the test.
select set_config('test.visible_profiles', (select count(*) from public.profiles where visible)::text, true);
select pg_temp.act_as(1);
select is((select count(*)::int from public.profiles), current_setting('test.visible_profiles')::int,
          'a member sees every visible profile');
select ok(exists (select 1 from public.profile_entities pe join public.entities e on e.id = pe.entity_id
                  where e.kind = 'country' and pe.profile_id <> auth.uid()),
          'a member sees other people''s country of origin');
select pg_temp.act_as(6);
select ok(exists (select 1 from public.profile_entities pe join public.entities e on e.id = pe.entity_id
                  where e.kind = 'country' and pe.profile_id <> auth.uid()),
          'a recruiter sees country of origin too');
select pg_temp.act_as(999);
select is((select count(*)::int from public.profiles), 0, 'without a profile you see no one');
select is((select count(*)::int from public.profile_entities), 0, 'without a profile you see no edges');

-- ───────── Ownership ─────────
select pg_temp.act_as(1);
update public.profiles set headline = 'hacked' where id = pg_temp.person(2);
select pg_temp.act_as(2);
select isnt((select headline from public.profiles where id = auth.uid()), 'hacked',
            'cannot edit someone else''s profile');
select pg_temp.act_as(1);
select throws_ok(format('insert into public.profile_entities (profile_id, entity_id) values (%L, 1)', pg_temp.person(2)),
                 '42501', null, 'cannot add edges to someone else');
delete from public.profile_entities where profile_id = pg_temp.person(2);
reset role;
select ok((select count(*) from public.profile_entities where profile_id = pg_temp.person(2)) > 0,
          'cannot remove someone else''s edges');
select pg_temp.act_as(1);
select throws_ok($$insert into public.entities (kind, name) values ('school', 'Fake U')$$, '42501', null,
                 'hubs are created only through entity_id_for');
select throws_ok('select count(*) from public.llm_daily_totals', '42501', null, 'global totals are server only');

-- ───────── Hidden profiles ─────────
select pg_temp.act_as(2);
update public.profiles set visible = false where id = auth.uid();
select is((select count(*)::int from public.profiles where id = auth.uid()), 1, 'hidden user still sees themselves');
select pg_temp.act_as(1);
select is((select count(*)::int from public.profiles where id = pg_temp.person(2)), 0, 'hidden profile is not listed');
select is((select count(*)::int from public.profile_entities where profile_id = pg_temp.person(2)), 0,
          'hidden profile''s edges are not listed');

-- ───────── Resolving hubs ─────────
select is(public.entity_id_for('school', '  UF '),
          (select id from public.entities where name = 'University of Florida'), 'alias resolves, ignoring case and spaces');
select is(public.entity_id_for('school', 'purdue university'),
          (select id from public.entities where name = 'Purdue University'), 'name resolves case-insensitively');
select is(public.entity_id_for('company', 'SpaceX'), public.entity_id_for('company', 'spacex'),
          'a new hub is created once and reused');
select is((select name from public.similar_entities('school', 'University of Florid') limit 1),
          'University of Florida', 'similar_entities suggests the closest hub');
select pg_temp.act_as(999);
select throws_ok($$select public.entity_id_for('school', 'X')$$, '42501', null,
                 'users without a profile cannot create hubs');

-- ───────── LLM quotas ─────────
select pg_temp.act_as(1);
select is(public.consume_llm_quota('search'), 4, 'first search leaves 4');
select public.consume_llm_quota('search') from generate_series(1, 3);
select is(public.consume_llm_quota('search'), 0, 'fifth search leaves 0');
select throws_ok($$select public.consume_llm_quota('search')$$, 'P0429', null, 'sixth search is refused');
select is(public.consume_llm_quota('resume'), 2, 'resume parses have their own limit');
select throws_ok($$select public.consume_llm_quota('chat')$$, '22023', null, 'unknown actions are refused');

reset role;
update public.llm_daily_totals set used = 2500;
select pg_temp.act_as(3);
select throws_ok($$select public.consume_llm_quota('search')$$, 'P0503', null, 'global daily cap is enforced');
select is((select count(*)::int from public.llm_usage where profile_id = auth.uid()), 0,
          'a refused call does not charge the user');
select is((select count(*)::int from public.llm_usage), 0, 'users only see their own usage');

select * from finish();
rollback;
