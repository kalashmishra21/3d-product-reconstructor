-- Add owner-scoped TripoSR history without changing historical or custom-model rows.
create table public.triposr_reconstruction_outputs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  object_name text check (object_name is null or (object_name = btrim(object_name) and char_length(object_name) between 1 and 80)),
  source_filename text not null check (char_length(source_filename) between 1 and 255 and source_filename !~ '[/\\]'),
  source_mime text not null check (source_mime in ('image/jpeg', 'image/png', 'image/webp')),
  source_width integer not null check (source_width > 0),
  source_height integer not null check (source_height > 0),
  source_size_bytes bigint not null check (source_size_bytes between 1 and 10485760),
  model_name text not null check (model_name = 'TripoSR'),
  engine text not null check (engine = 'stabilityai/TripoSR'),
  model_version text not null check (model_version ~ '^[0-9a-f]{64}$'),
  output_type text not null check (output_type = 'colored_triangle_mesh'),
  extraction_resolution integer not null check (extraction_resolution between 64 and 512),
  vertices_count integer not null check (vertices_count between 3 and 1000000),
  faces_count integer not null check (faces_count between 1 and 2000000),
  inference_ms numeric(12,3) not null check (inference_ms >= 0),
  model_init_ms numeric(12,3) not null check (model_init_ms >= 0),
  input_path text not null,
  obj_path text not null,
  glb_path text not null,
  input_size_bytes bigint not null check (input_size_bytes between 1 and 10485760),
  obj_size_bytes bigint not null check (obj_size_bytes > 0),
  glb_size_bytes bigint not null check (glb_size_bytes > 0),
  created_at timestamptz not null default now(),
  constraint triposr_input_path check (
    input_path = user_id::text || '/' || id::text || '/triposr-v1/input.' ||
      case source_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end
  ),
  constraint triposr_obj_path check (obj_path = user_id::text || '/' || id::text || '/triposr-v1/prediction.obj'),
  constraint triposr_glb_path check (glb_path = user_id::text || '/' || id::text || '/triposr-v1/prediction.glb')
);

create index triposr_outputs_owner_created_idx
  on public.triposr_reconstruction_outputs (user_id, created_at desc);

alter table public.triposr_reconstruction_outputs enable row level security;
revoke all on public.triposr_reconstruction_outputs from anon, authenticated;
grant select, insert, delete on public.triposr_reconstruction_outputs to authenticated;

create policy triposr_outputs_owner_select on public.triposr_reconstruction_outputs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy triposr_outputs_owner_insert on public.triposr_reconstruction_outputs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy triposr_outputs_owner_delete on public.triposr_reconstruction_outputs
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Existing private artifact policies remain unchanged. These scoped keys use the same owner/UUID layout.
create policy triposr_artifacts_select on storage.objects for select to authenticated
  using (bucket_id = 'reconstruction-artifacts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}/triposr-v1/(input\.(jpg|png|webp)|prediction\.(obj|glb))$'));
create policy triposr_artifacts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reconstruction-artifacts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}/triposr-v1/(input\.(jpg|png|webp)|prediction\.(obj|glb))$'));
create policy triposr_artifacts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'reconstruction-artifacts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}/triposr-v1/(input\.(jpg|png|webp)|prediction\.(obj|glb))$'));

update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime_type)
  from unnest(coalesce(allowed_mime_types, '{}'::text[]) || array['text/plain','model/gltf-binary']::text[]) as types(mime_type)
)
where id = 'reconstruction-artifacts';
