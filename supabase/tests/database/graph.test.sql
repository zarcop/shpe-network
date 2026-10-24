-- The graph() payload: same visibility rules as reading the tables directly.
-- Seed ids: person i is 00000000-0000-4000-8000-<i padded to 12> (seed.sql).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create function pg_temp.act_as(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true)
$$;

create function pg_temp.person_ids(g jsonb) returns uuid[] language sql as $$
  select array(select (p->>'id')::uuid from jsonb_array_elements(g->'people') p)
$$;

create function pg_temp.link_owners(g jsonb) returns uuid[] language sql as $$
  select array(select distinct (l->>0)::uuid from jsonb_array_elements(g->'links') l)
$$;

-- A signed-up user without a profile, and a hub only a soon-to-be-hidden person links to.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000999',
        'authenticated', 'authenticated', 'new@shpe-network.test', '', now(), now());
select set_config('test.visible_profiles', (select count(*) from public.profiles where visible)::text, true);

select pg_temp.act_as('00000000-0000-4000-8000-000000000002');
select public.set_my_hubs('{"school": ["Only Person Two Institute"]}');
update public.profiles set visible = false where id = auth.uid();

select pg_temp.act_as('00000000-0000-4000-8000-000000000001');
select set_config('test.graph', public.graph()::text, true);

select is(jsonb_array_length(current_setting('test.graph')::jsonb->'people'),
          current_setting('test.visible_profiles')::int - 1, 'lists every visible person');
select ok(not '00000000-0000-4000-8000-000000000002' = any(pg_temp.person_ids(current_setting('test.graph')::jsonb)),
          'hidden people are left out');
select ok(not '00000000-0000-4000-8000-000000000002' = any(pg_temp.link_owners(current_setting('test.graph')::jsonb)),
          'hidden people''s links are left out');
select ok(not exists (select 1 from jsonb_array_elements(current_setting('test.graph')::jsonb->'hubs') h
                      where h->>'name' = 'Only Person Two Institute'),
          'hubs nobody visible links to are left out');
select ok(pg_temp.link_owners(current_setting('test.graph')::jsonb)
            <@ pg_temp.person_ids(current_setting('test.graph')::jsonb),
          'every link starts at a listed person');
select ok(not exists (
            select 1 from jsonb_array_elements(current_setting('test.graph')::jsonb->'links') l
            where not exists (select 1 from jsonb_array_elements(current_setting('test.graph')::jsonb->'hubs') h
                              where h->'id' = l->1)),
          'every link ends at a listed hub');

select pg_temp.act_as('00000000-0000-4000-8000-000000000999');
select is(public.graph(), '{"people": [], "hubs": [], "links": []}'::jsonb,
          'users without a profile see an empty graph');

reset role;
set local role anon;
select throws_ok('select public.graph()', '42501', null, 'anon cannot read the graph');

select * from finish();
rollback;
