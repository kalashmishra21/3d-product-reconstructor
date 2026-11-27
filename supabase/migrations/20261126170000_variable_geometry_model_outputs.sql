-- Add versioned variable-geometry outputs without changing historical rows or constraints.
create table public.model_reconstruction_outputs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  object_name text check (object_name is null or (object_name = btrim(object_name) and char_length(object_name) between 1 and 80)),
  source_filename text not null check (char_length(source_filename) between 1 and 255 and source_filename !~ '[/\\]'),
  source_mime text not null check (source_mime in ('image/jpeg', 'image/png', 'image/webp')),
  source_width integer not null check (source_width = 224),
  source_height integer not null check (source_height = 224),
  source_size_bytes bigint not null check (source_size_bytes between 1 and 10485760),
  camera_json jsonb not null check (jsonb_typeof(camera_json) = 'object'),
  model_name text not null check (model_name = 'Pixel3Mesh'),
  model_version text not null check (char_length(model_version) between 1 and 120),
  checkpoint_sha256 text not null check (checkpoint_sha256 ~ '^[0-9a-f]{64}$'),
  engine text not null check (engine = 'pixel3mesh-six-category'),
  output_type text not null check (output_type = 'point_cloud_and_visible_surface'),
  global_points_count integer not null check (global_points_count > 0),
  vertices_count integer not null check (vertices_count > 0),
  faces_count integer not null check (faces_count > 0),
  inference_ms numeric(12,3) not null check (inference_ms >= 0),
  input_path text not null,
  points_path text not null,
  mesh_path text not null,
  input_size_bytes bigint not null check (input_size_bytes between 1 and 10485760),
  points_size_bytes bigint not null check (points_size_bytes > 0),
  mesh_size_bytes bigint not null check (mesh_size_bytes > 0),
  created_at timestamptz not null default now(),
  constraint model_output_input_path check (
    input_path = user_id::text || '/' || id::text || '/model-v1/input.' ||
      case source_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end
  ),
  constraint model_output_points_path check (
    points_path = user_id::text || '/' || id::text || '/model-v1/global_points.ply'
  ),
  constraint model_output_mesh_path check (
    mesh_path = user_id::text || '/' || id::text || '/model-v1/visible_surface.obj'
  )
);

create index model_reconstruction_outputs_owner_created_idx
  on public.model_reconstruction_outputs (user_id, created_at desc);

alter table public.model_reconstruction_outputs enable row level security;
revoke all on public.model_reconstruction_outputs from anon, authenticated;
grant select, insert on public.model_reconstruction_outputs to authenticated;

create policy model_outputs_owner_select on public.model_reconstruction_outputs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy model_outputs_owner_insert on public.model_reconstruction_outputs
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- New object keys are isolated under owner/reconstruction/model-v1; old policies remain unchanged.
create policy model_output_artifacts_select on storage.objects for select to authenticated
  using (bucket_id = 'reconstruction-artifacts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}/model-v1/(input\.(jpg|png|webp)|global_points\.ply|visible_surface\.obj)$'));
create policy model_output_artifacts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reconstruction-artifacts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}/model-v1/(input\.(jpg|png|webp)|global_points\.ply|visible_surface\.obj)$'));
create policy model_output_artifacts_update on storage.objects for update to authenticated
  using (bucket_id = 'reconstruction-artifacts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}/model-v1/(input\.(jpg|png|webp)|global_points\.ply|visible_surface\.obj)$'))
  with check (bucket_id = 'reconstruction-artifacts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}/model-v1/(input\.(jpg|png|webp)|global_points\.ply|visible_surface\.obj)$'));
create policy model_output_artifacts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'reconstruction-artifacts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}/model-v1/(input\.(jpg|png|webp)|global_points\.ply|visible_surface\.obj)$'));

-- The versioned point export is an ASCII PLY blob uploaded as application/octet-stream.
-- Keep the existing allowlist and append only the required content type.
update storage.buckets
set allowed_mime_types = coalesce(allowed_mime_types, '{}'::text[]) || array['application/octet-stream']::text[]
where id = 'reconstruction-artifacts'
  and not ('application/octet-stream' = any(coalesce(allowed_mime_types, '{}'::text[])));
