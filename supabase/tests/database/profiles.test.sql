-- Creating a profile right after sign-in: ownership, constraints, normalization and account deletion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.act_as(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true)
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000998',
        'authenticated', 'authenticated', 'other@shpe-network.test', '', now(), now()),
       ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000999',
        'authenticated', 'authenticated', 'new@shpe-network.test', '', now(), now());

select hasnt_column('public', 'profiles', 'email', 'emails stay in auth.users, never on public profiles');

select pg_temp.act_as('00000000-0000-4000-8000-000000000999');

select throws_ok($$insert into public.profiles (id, full_name) values ('00000000-0000-4000-8000-000000000998', 'Not Me')$$,
                 '42501', null, 'cannot create a profile for someone else');
select throws_ok($$insert into public.profiles (id, full_name) values (auth.uid(), '   ')$$,
                 '23514', null, 'a blank name is refused');
select throws_ok($$insert into public.profiles (id, full_name, linkedin_url) values (auth.uid(), 'Ana', 'https://evil.com/in/ana')$$,
                 '23514', null, 'a non-LinkedIn link is refused');
select throws_ok($$insert into public.profiles (id, full_name, grad_year) values (auth.uid(), 'Ana', 2041)$$,
                 '23514', null, 'an impossible graduation year is refused');
select throws_ok($$insert into public.profiles (id, full_name) values (auth.uid(), repeat('a', 121))$$,
                 '23514', null, 'a name over 120 characters is refused');

select lives_ok($$insert into public.profiles (id, full_name, headline, linkedin_url)
                  values (auth.uid(), '  Ana   María  Pérez ', '   ', ' ')$$, 'creates your own profile');
select results_eq($$select full_name, headline, linkedin_url from public.profiles where id = auth.uid()$$,
                  $$values ('Ana María Pérez'::text, null::text, null::text)$$,
                  'text is trimmed and single-spaced; blank optional fields are stored as null');
select throws_ok($$insert into public.profiles (id, full_name) values (auth.uid(), 'Ana Again')$$,
                 '23505', null, 'one profile per account');

update public.profiles set headline = '  ME   student ' where id = auth.uid();
select is((select headline from public.profiles where id = auth.uid()), 'ME student', 'edits are normalized too');
select is(public.has_profile(), true, 'a new profile can browse right away');

-- Data the account owns, so deletion can be checked below.
insert into public.profile_entities (profile_id, entity_id) values (auth.uid(), public.entity_id_for('school', 'UF'));
select public.consume_llm_quota('search');

reset role;
delete from auth.users where id = '00000000-0000-4000-8000-000000000999';
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-000000000999'), 0,
          'deleting the account deletes the profile');
select is((select count(*)::int from public.profile_entities where profile_id = '00000000-0000-4000-8000-000000000999'), 0,
          'and its connections');
select is((select count(*)::int from public.llm_usage where profile_id = '00000000-0000-4000-8000-000000000999'), 0,
          'and its usage');

select * from finish();
rollback;
