-- Career-fair employers (20261025000000_career_fair_companies.sql): there, with logos, and reachable by nickname.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select is((select count(*)::int from public.entities
           where kind = 'company' and name in ('Bank of America', 'NVIDIA', 'Datadog', 'Wells Fargo', 'L''Oréal')
             and domain is not null),
          5, 'career-fair employers are hubs with a website for the logo');
select is((select domain from public.entities where kind = 'company' and name = 'Walt Disney Imagineering'),
          'disneyimagineering.com', 'domains are the ones checked against Logo.dev');
select ok((select 'bofa' = any(aliases) from public.entities where kind = 'company' and name = 'Bank of America'),
          'resume spellings resolve to the employer');
select ok((select 'honeywell aerospace' = any(aliases) from public.entities where kind = 'company' and name = 'Honeywell'),
          'Honeywell''s two exhibiting businesses are the one Honeywell hub');
select is((select count(*)::int from public.entities where kind = 'company' and 'turner' = any(aliases)), 0,
          'nicknames that are also people''s names are left out');

select * from finish();
rollback;
