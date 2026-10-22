-- Schema, row level security and LLM quotas for SHPE Network.
-- The graph is people linked to four kinds of hub: school, company, country, major.

create extension if not exists pg_trgm with schema extensions;

-- ───────────────────────── Profiles ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  headline text check (char_length(headline) <= 200),
  avatar_url text check (avatar_url ~ '^https://'),
  linkedin_url text check (linkedin_url ~ '^https://([a-z]+\.)?linkedin\.com/'),
  grad_year int check (grad_year between 1950 and 2040),
  visible boolean not null default true,  -- false: only the owner sees the profile and its edges
  created_at timestamptz not null default now()
);

-- Signing up isn't enough to browse: you join the graph by creating a profile.
-- Security definer so policies on profiles can call it without recursing into their own RLS.
create function public.has_profile() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid())
$$;

-- ───────────────────────── Hubs (entities) ─────────────────────────

create table public.entities (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('school', 'company', 'country', 'major')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  aliases text[] not null default '{}'  -- spellings that resolve to this entity: 'uf', 'ut austin'
    check (aliases::text = lower(aliases::text))  -- lookups compare lowercase
);

create unique index entities_kind_name_idx on public.entities (kind, lower(name));
create index entities_aliases_idx on public.entities using gin (aliases);
create index entities_name_trgm_idx on public.entities using gin (lower(name) extensions.gin_trgm_ops);

-- Resolves a name to an entity of the given kind: exact name or alias (case-insensitive),
-- otherwise creates it. Fuzzy suggestions ("did you mean") happen before this, on the review screen.
create function public.entity_id_for(p_kind text, p_name text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  v_id bigint;
begin
  if not public.has_profile() then
    raise exception 'create your profile first' using errcode = '42501';
  end if;

  select e.id into v_id from public.entities e
  where e.kind = p_kind and (lower(e.name) = lower(v_name) or lower(v_name) = any(e.aliases))
  order by (lower(e.name) = lower(v_name)) desc
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.entities (kind, name) values (p_kind, v_name)
  on conflict (kind, lower(name)) do update set name = public.entities.name
  returning id into v_id;
  return v_id;
end $$;

-- Closest existing entities for a name, for the review screen's "did you mean".
create function public.similar_entities(p_kind text, p_name text)
returns table (id bigint, name text, score real)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.name, extensions.similarity(lower(e.name), lower(p_name))
  from public.entities e
  where e.kind = p_kind
    and (extensions.similarity(lower(e.name), lower(p_name)) > 0.3 or lower(p_name) = any(e.aliases))
  order by lower(p_name) = any(e.aliases) desc, 3 desc
  limit 5
$$;

-- ───────────────────────── Edges ─────────────────────────

create table public.profile_entities (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  entity_id bigint not null references public.entities (id),
  added_at timestamptz not null default now(),
  primary key (profile_id, entity_id)
);

create index profile_entities_entity_idx on public.profile_entities (entity_id);

-- ───────────────────────── LLM quotas ─────────────────────────

create table public.llm_usage (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  action text not null check (action in ('search', 'resume')),
  used int not null,
  primary key (profile_id, day, action)
);

-- Safety net across all users, so a bug or a bot can't run up the API bill.
create table public.llm_daily_totals (
  day date primary key,
  used int not null
);

-- Spends one LLM call for the caller before the API calls the model. Each counter moves in a
-- single statement that only succeeds under its limit, so concurrent requests can't overshoot.
-- Days are UTC. Returns the caller's remaining calls for that action today.
create function public.consume_llm_quota(p_action text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_limit int := case p_action when 'search' then 5 when 'resume' then 3 end;
  v_global_limit constant int := 2500;
  v_day date := (now() at time zone 'utc')::date;
  v_used int;
begin
  if v_limit is null then
    raise exception 'unknown action %', p_action using errcode = '22023';
  end if;
  if not public.has_profile() then
    raise exception 'create your profile first' using errcode = '42501';
  end if;

  insert into public.llm_usage as u (profile_id, day, action, used)
  values (auth.uid(), v_day, p_action, 1)
  on conflict (profile_id, day, action) do update set used = u.used + 1 where u.used < v_limit
  returning u.used into v_used;
  if v_used is null then
    raise exception 'daily % limit reached', p_action using errcode = 'P0429';
  end if;

  insert into public.llm_daily_totals as t (day, used) values (v_day, 1)
  on conflict (day) do update set used = t.used + 1 where t.used < v_global_limit;
  if not found then
    -- Raising rolls back the per-user increment too, so the caller isn't charged.
    raise exception 'daily service limit reached' using errcode = 'P0503';
  end if;

  return v_limit - v_used;
end $$;

-- ───────────────────────── Row level security ─────────────────────────

alter table public.profiles enable row level security;
alter table public.entities enable row level security;
alter table public.profile_entities enable row level security;
alter table public.llm_usage enable row level security;
alter table public.llm_daily_totals enable row level security;

-- Nothing is reachable without signing in.
revoke all on all tables in schema public from anon;
revoke all on public.llm_daily_totals from authenticated;
revoke insert, update, delete, truncate on public.entities, public.llm_usage from authenticated;

create policy "visible profiles and your own" on public.profiles for select to authenticated
  using (id = auth.uid() or (visible and public.has_profile()));
create policy "create your own profile" on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "edit your own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "delete your own profile" on public.profiles for delete to authenticated
  using (id = auth.uid());

create policy "signed-in users read hubs" on public.entities for select to authenticated
  using (public.has_profile());

-- An edge is visible when its profile is: the profiles policy hides other people's hidden profiles.
create policy "edges of profiles you can see" on public.profile_entities for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_id));
create policy "add your own edges" on public.profile_entities for insert to authenticated
  with check (profile_id = auth.uid());
create policy "remove your own edges" on public.profile_entities for delete to authenticated
  using (profile_id = auth.uid());
revoke update on public.profile_entities from authenticated;

create policy "your own usage" on public.llm_usage for select to authenticated
  using (profile_id = auth.uid());

-- ───────────────────────── Function access ─────────────────────────

-- Postgres lets PUBLIC execute every new function. Take that away, then grant back only what a
-- signed-in user needs.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.has_profile() to authenticated;
grant execute on function public.entity_id_for(text, text) to authenticated;
grant execute on function public.similar_entities(text, text) to authenticated;
grant execute on function public.consume_llm_quota(text) to authenticated;
grant execute on all functions in schema public to service_role;
