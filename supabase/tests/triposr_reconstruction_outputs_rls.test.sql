begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select has_table('public', 'triposr_reconstruction_outputs', 'TripoSR history table exists');
select has_column('public', 'triposr_reconstruction_outputs', 'vertices_count', 'variable vertex count is persisted');
select has_column('public', 'triposr_reconstruction_outputs', 'faces_count', 'variable face count is persisted');
select has_column('public', 'triposr_reconstruction_outputs', 'model_version', 'checkpoint identity is persisted');
select is((select relrowsecurity from pg_class where oid = 'public.triposr_reconstruction_outputs'::regclass), true, 'RLS is enabled');
select is((select count(*) from pg_policies where schemaname='public' and tablename='triposr_reconstruction_outputs' and cmd='SELECT'), 1::bigint, 'owner read policy exists');
select is((select count(*) from pg_policies where schemaname='public' and tablename='triposr_reconstruction_outputs' and cmd='INSERT'), 1::bigint, 'owner insert policy exists');
select is((select count(*) from pg_policies where schemaname='public' and tablename='triposr_reconstruction_outputs' and cmd='DELETE'), 1::bigint, 'owner delete policy exists');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='triposr_reconstruction_outputs' and grantee='anon'), 0::bigint, 'anon has no table access');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'triposr_artifacts_%'), 3::bigint, 'private asset policies are present');
select ok((select bool_and(coalesce(qual, with_check) like '%auth.uid%') from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'triposr_artifacts_%'), 'private asset policies check authenticated owner');
select ok((select not public from storage.buckets where id='reconstruction-artifacts'), 'artifact bucket remains private');
select is((select count(*) from pg_constraint where conrelid='public.reconstructions'::regclass and pg_get_constraintdef(oid) like '%2466%'), 1::bigint, 'historical fixed-topology records remain constrained and untouched');
insert into auth.users (id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data)
values ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','tripo-owner@example.invalid','','{}','{}'),
       ('99999999-9999-4999-8999-999999999999','authenticated','authenticated','tripo-other@example.invalid','','{}','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select lives_ok($$insert into public.triposr_reconstruction_outputs (
 id,user_id,source_filename,source_mime,source_width,source_height,source_size_bytes,
 model_name,engine,model_version,output_type,extraction_resolution,vertices_count,faces_count,
 inference_ms,model_init_ms,input_path,obj_path,glb_path,input_size_bytes,obj_size_bytes,glb_size_bytes
) values (
 '33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','speaker.jpg','image/jpeg',960,720,4096,
 'TripoSR','stabilityai/TripoSR','429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee','colored_triangle_mesh',256,57006,114004,
 4200,10600,'11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/triposr-v1/input.jpg',
 '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/triposr-v1/prediction.obj',
 '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/triposr-v1/prediction.glb',4096,1000000,500000
)$$, 'owner can save variable-size TripoSR geometry');
select is((select count(*) from public.triposr_reconstruction_outputs where id='33333333-3333-4333-8333-333333333333'),1::bigint,'owner can reopen its result');
select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
select is((select count(*) from public.triposr_reconstruction_outputs where id='33333333-3333-4333-8333-333333333333'),0::bigint,'other user cannot read the result');
select throws_ok($$insert into public.triposr_reconstruction_outputs (
 id,user_id,source_filename,source_mime,source_width,source_height,source_size_bytes,
 model_name,engine,model_version,output_type,extraction_resolution,vertices_count,faces_count,
 inference_ms,model_init_ms,input_path,obj_path,glb_path,input_size_bytes,obj_size_bytes,glb_size_bytes
) values (
 '44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','speaker.jpg','image/jpeg',960,720,4096,
 'TripoSR','stabilityai/TripoSR','429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee','colored_triangle_mesh',256,57006,114004,
 4200,10600,'11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/triposr-v1/input.jpg',
 '11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/triposr-v1/prediction.obj',
 '11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/triposr-v1/prediction.glb',4096,1000000,500000
)$$,'42501',null,'another user cannot insert a record for the owner');

reset role;
select * from finish();
rollback;
