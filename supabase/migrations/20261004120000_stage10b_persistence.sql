-- Stage 10B: owner-scoped metadata and private files. No existing data is removed.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or (display_name = btrim(display_name) and char_length(display_name) between 1 and 80)),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_avatar_owner check (
    avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
  )
);

create table if not exists public.reconstructions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_name text check (object_name is null or (object_name = btrim(object_name) and char_length(object_name) between 1 and 80)),
  source_filename text not null check (char_length(source_filename) between 1 and 255 and source_filename !~ '[/\\]'),
  source_mime text not null check (source_mime in ('image/jpeg', 'image/png', 'image/webp')),
  source_width integer not null check (source_width > 0 and source_width <= 16384),
  source_height integer not null check (source_height > 0 and source_height <= 16384),
  source_size_bytes bigint not null check (source_size_bytes between 1 and 10485760),
  status text not null default 'processing' check (status in ('processing', 'completed', 'low_volume', 'failed', 'interrupted')),
  model_name text,
  stage integer,
  vertices_count integer,
  faces_count integer,
  inference_ms numeric(12,3) check (inference_ms >= 0),
  model_init_ms numeric(12,3) check (model_init_ms >= 0),
  total_ms numeric(12,3) check (total_ms >= 0),
  source_path text,
  mesh_json_path text,
  obj_path text,
  glb_path text,
  obj_size_bytes bigint check (obj_size_bytes > 0),
  glb_size_bytes bigint check (glb_size_bytes > 0),
  error_message text check (error_message is null or char_length(error_message) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint reconstruction_source_path check (source_path is null or source_path ~ ('^' || user_id::text || '/' || id::text || '/source\.(jpg|png|webp)$')),
  constraint reconstruction_json_path check (mesh_json_path is null or mesh_json_path = user_id::text || '/' || id::text || '/stage3.json'),
  constraint reconstruction_obj_path check (obj_path is null or obj_path = user_id::text || '/' || id::text || '/stage3.obj'),
  constraint reconstruction_glb_path check (glb_path is null or glb_path = user_id::text || '/' || id::text || '/stage3.glb'),
  constraint reconstruction_final_mesh check (
    status not in ('completed', 'low_volume') or
    (coalesce(model_name = 'Pixel2Mesh', false) and coalesce(stage = 3, false)
      and coalesce(vertices_count = 2466, false) and coalesce(faces_count = 4928, false)
      and source_path is not null and mesh_json_path is not null and obj_path is not null and glb_path is not null
      and obj_size_bytes is not null and glb_size_bytes is not null)
  )
);

create index if not exists reconstructions_owner_created_idx on public.reconstructions (user_id, created_at desc);
create index if not exists reconstructions_owner_status_idx on public.reconstructions (user_id, status);

create or replace function public.stage10b_set_timestamps()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  if tg_table_name = 'reconstructions' and tg_op = 'INSERT' then
    new.completed_at := case when new.status in ('completed', 'low_volume') then now() else null end;
  elsif tg_table_name = 'reconstructions' then
    if new.status in ('completed', 'low_volume') then
      new.completed_at := coalesce(old.completed_at, now());
    else
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger stage10b_profiles_timestamps before update on public.profiles
for each row execute function public.stage10b_set_timestamps();
create trigger stage10b_reconstructions_timestamps before insert or update on public.reconstructions
for each row execute function public.stage10b_set_timestamps();

alter table public.profiles enable row level security;
alter table public.reconstructions enable row level security;
revoke all on public.profiles from anon, authenticated;
revoke all on public.reconstructions from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, display_name, avatar_path) on public.profiles to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;
grant select on public.reconstructions to authenticated;
grant insert (user_id, object_name, source_filename, source_mime, source_width, source_height, source_size_bytes, status) on public.reconstructions to authenticated;
grant update (object_name, status, model_name, stage, vertices_count, faces_count, inference_ms, model_init_ms, total_ms,
  source_path, mesh_json_path, obj_path, glb_path, obj_size_bytes, glb_size_bytes, error_message) on public.reconstructions to authenticated;
grant delete on public.reconstructions to authenticated;

create policy stage10b_profile_select on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy stage10b_profile_insert on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy stage10b_profile_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy stage10b_reconstruction_select on public.reconstructions for select to authenticated using ((select auth.uid()) = user_id);
create policy stage10b_reconstruction_insert on public.reconstructions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy stage10b_reconstruction_update on public.reconstructions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy stage10b_reconstruction_delete on public.reconstructions for delete to authenticated using ((select auth.uid()) = user_id);

-- Bucket definitions are the reproducible source of truth. Never write storage.objects via SQL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reconstruction-artifacts', 'reconstruction-artifacts', false, 12582912,
  array['image/jpeg', 'image/png', 'image/webp', 'application/json', 'text/plain', 'model/gltf-binary'])
on conflict (id) do nothing;

create policy stage10b_avatar_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'));
create policy stage10b_avatar_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'));
create policy stage10b_avatar_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'))
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'));
create policy stage10b_avatar_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'));
create policy stage10b_artifact_select on storage.objects for select to authenticated
  using (bucket_id = 'reconstruction-artifacts' and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}/(source\.(jpg|png|webp)|stage3\.(json|obj|glb))$'));
create policy stage10b_artifact_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reconstruction-artifacts' and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}/(source\.(jpg|png|webp)|stage3\.(json|obj|glb))$'));
create policy stage10b_artifact_update on storage.objects for update to authenticated
  using (bucket_id = 'reconstruction-artifacts' and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}/(source\.(jpg|png|webp)|stage3\.(json|obj|glb))$'))
  with check (bucket_id = 'reconstruction-artifacts' and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}/(source\.(jpg|png|webp)|stage3\.(json|obj|glb))$'));
create policy stage10b_artifact_delete on storage.objects for delete to authenticated
  using (bucket_id = 'reconstruction-artifacts' and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}/(source\.(jpg|png|webp)|stage3\.(json|obj|glb))$'));
