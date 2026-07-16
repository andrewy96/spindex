-- Profile settings: display avatars and let users upload their own profile image.

alter table public.profiles
  add column if not exists avatar_url text
    check (avatar_url is null or char_length(avatar_url) <= 2048);

grant update (display_name, city, avatar_url) on public.profiles to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile avatars are public" on storage.objects;
create policy "profile avatars are public" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "users upload own profile avatars" on storage.objects;
create policy "users upload own profile avatars" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "users update own profile avatars" on storage.objects;
create policy "users update own profile avatars" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "users delete own profile avatars" on storage.objects;
create policy "users delete own profile avatars" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );
