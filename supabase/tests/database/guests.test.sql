-- Guests ("Join now", anonymous sign-in) are signed-in users with is_anonymous in their token. They follow the
-- same rules as everyone else: create a profile, then see the graph. Visitors without a session still see nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, is_anonymous, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000777',
        'authenticated', 'authenticated', null, '', true, now(), now());

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-000000000777',
                                                          'role', 'authenticated', 'is_anonymous', true)::text, true);

select is(public.graph(), '{"people": [], "hubs": [], "links": []}'::jsonb, 'a guest without a profile sees nothing yet');
select lives_ok($$insert into public.profiles (id, full_name) values (auth.uid(), 'Guest Person')$$,
                'a guest can create their profile');
select lives_ok($$select public.set_my_hubs('{"school": ["UF"]}')$$, 'a guest can save a background');
select ok(jsonb_array_length(public.graph()->'people') > 1, 'a guest with a profile sees the graph');

reset role;
set local role anon;
select throws_ok('select public.graph()', '42501', null, 'visitors without a session still see nothing');

select * from finish();
rollback;
