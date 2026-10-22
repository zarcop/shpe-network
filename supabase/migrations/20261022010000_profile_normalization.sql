-- Profiles arrive from the app now and from the resume parser later. Normalize here so every writer
-- stores the same shape: single-spaced, trimmed text, and no empty strings standing in for "not given".

create function public.normalize_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.full_name := regexp_replace(btrim(new.full_name), '\s+', ' ', 'g');
  new.headline := nullif(regexp_replace(btrim(new.headline), '\s+', ' ', 'g'), '');
  new.avatar_url := nullif(btrim(new.avatar_url), '');
  new.linkedin_url := nullif(btrim(new.linkedin_url), '');
  return new;
end $$;

create trigger profiles_normalize before insert or update on public.profiles
  for each row execute function public.normalize_profile();

-- New functions are executable by PUBLIC by default; keep the init migration's rule of granting nothing implicitly.
revoke execute on function public.normalize_profile() from public, anon, authenticated;
