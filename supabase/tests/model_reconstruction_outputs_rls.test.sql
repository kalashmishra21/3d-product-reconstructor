begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select has_table('public', 'model_reconstruction_outputs', 'variable geometry history table exists');
select has_column('public', 'model_reconstruction_outputs', 'checkpoint_sha256', 'checkpoint identity is recorded');
select has_column('public', 'model_reconstruction_outputs', 'engine', 'engine version is recorded');
select has_column('public', 'model_reconstruction_outputs', 'global_points_count', 'global point count is recorded');
select has_column('public', 'model_reconstruction_outputs', 'mesh_path', 'private mesh key is recorded');
select has_column('public', 'model_reconstruction_outputs', 'camera_json', 'matching camera metadata is retained');
select is((select relrowsecurity from pg_class where oid = 'public.model_reconstruction_outputs'::regclass), true, 'new table has row-level security');
select is((select count(*) from pg_policies where schemaname='public' and tablename='model_reconstruction_outputs' and cmd='SELECT'), 1::bigint, 'one owner SELECT policy is defined');
select is((select count(*) from pg_policies where schemaname='public' and tablename='model_reconstruction_outputs' and cmd='INSERT'), 1::bigint, 'one owner INSERT policy is defined');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='model_reconstruction_outputs' and grantee='anon'), 0::bigint, 'anonymous history grants are absent');
select is((select count(*) from information_schema.check_constraints where constraint_name in ('model_output_input_path', 'model_output_points_path', 'model_output_mesh_path')), 3::bigint, 'all private object keys are constrained');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'model_output_artifacts_%'), 4::bigint, 'four owner-scoped output storage policies are defined');
select ok((select 'application/octet-stream'=any(allowed_mime_types) from storage.buckets where id='reconstruction-artifacts'), 'private artifact bucket accepts predicted PLY files');
select ok((select bool_and(coalesce(qual, with_check) like '%auth.uid%') from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'model_output_artifacts_%'), 'storage access checks authenticated owner');
select is((select count(*) from pg_constraint where conrelid='public.reconstructions'::regclass and pg_get_constraintdef(oid) like '%2466%'), 1::bigint, 'historical fixed-topology constraint remains intact');

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'model-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated', 'other-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select lives_ok($$insert into public.model_reconstruction_outputs (
  id, user_id, object_name, source_filename, source_mime, source_width, source_height, source_size_bytes,
  camera_json, model_name, model_version, checkpoint_sha256, engine, output_type, global_points_count,
  vertices_count, faces_count, inference_ms, input_path, points_path, mesh_path,
  input_size_bytes, points_size_bytes, mesh_size_bytes
) values (
  '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Chair', 'chair.png', 'image/png', 224, 224, 1024,
  '{"pose":[0,1,0,1]}'::jsonb, 'Pixel3Mesh', 'ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500',
  'ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500', 'pixel3mesh-six-category', 'point_cloud_and_visible_surface',
  2048, 5517, 10693, 100.5,
  '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/model-v1/input.png',
  '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/model-v1/global_points.ply',
  '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/model-v1/visible_surface.obj',
  1024, 8192, 65536
)$$, 'authenticated owner can save variable-size predicted geometry');
select is((select count(*) from public.model_reconstruction_outputs where id='22222222-2222-4222-8222-222222222222'), 1::bigint, 'owner can reopen its history row');
select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
select is((select count(*) from public.model_reconstruction_outputs where id='22222222-2222-4222-8222-222222222222'), 0::bigint, 'another user cannot read the owner row');
select throws_ok($$insert into public.model_reconstruction_outputs (
  id, user_id, object_name, source_filename, source_mime, source_width, source_height, source_size_bytes,
  camera_json, model_name, model_version, checkpoint_sha256, engine, output_type, global_points_count,
  vertices_count, faces_count, inference_ms, input_path, points_path, mesh_path,
  input_size_bytes, points_size_bytes, mesh_size_bytes
) select '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', object_name,
  source_filename, source_mime, source_width, source_height, source_size_bytes, camera_json, model_name,
  model_version, checkpoint_sha256, engine, output_type, global_points_count, vertices_count, faces_count,
  inference_ms, input_path, points_path, mesh_path, input_size_bytes, points_size_bytes, mesh_size_bytes
  from (select 'Chair'::text as object_name, 'chair.png'::text as source_filename, 'image/png'::text as source_mime,
    224::integer as source_width, 224::integer as source_height, 1024::bigint as source_size_bytes,
    '{"pose":[0,1,0,1]}'::jsonb as camera_json, 'Pixel3Mesh'::text as model_name,
    'ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500'::text as model_version,
    'ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500'::text as checkpoint_sha256,
    'pixel3mesh-six-category'::text as engine, 'point_cloud_and_visible_surface'::text as output_type,
    2048::integer as global_points_count, 5517::integer as vertices_count, 10693::integer as faces_count,
    100.5::numeric as inference_ms,
    '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/model-v1/input.png'::text as input_path,
    '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/model-v1/global_points.ply'::text as points_path,
    '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/model-v1/visible_surface.obj'::text as mesh_path,
    1024::bigint as input_size_bytes, 8192::bigint as points_size_bytes, 65536::bigint as mesh_size_bytes) as candidate$$,
  '42501', null, 'another user cannot insert a history row for the owner');
reset role;

select * from finish();
rollback;
