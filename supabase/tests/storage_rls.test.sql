begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select is((select public from storage.buckets where id='avatars'), false, 'avatars bucket private');
select is((select public from storage.buckets where id='reconstruction-artifacts'), false, 'artifacts bucket private');
select is((select file_size_limit from storage.buckets where id='avatars'), 3145728::bigint, 'avatar limit 3 MiB');
select ok((select file_size_limit >= 10485760 from storage.buckets where id='reconstruction-artifacts'), 'source images up to 10 MiB');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'stage10b_avatar_%'), 4::bigint, 'four avatar object policies');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'stage10b_artifact_%'), 4::bigint, 'four artifact object policies');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'stage10b_avatar_%' and roles::text like '%authenticated%'), 4::bigint, 'avatars authenticated only');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'stage10b_artifact_%' and roles::text like '%authenticated%'), 4::bigint, 'artifacts authenticated only');
select ok((select bool_and(qual like '%auth.uid%' or with_check like '%auth.uid%') from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'stage10b_avatar_%'), 'avatar policies check uid');
select ok((select bool_and(qual like '%auth.uid%' or with_check like '%auth.uid%') from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'stage10b_artifact_%'), 'artifact policies check uid');
select ok((select 'image/jpeg'=any(allowed_mime_types) from storage.buckets where id='avatars'), 'JPEG avatar allowed');
select ok((select 'model/gltf-binary'=any(allowed_mime_types) from storage.buckets where id='reconstruction-artifacts'), 'GLB allowed');
select ok((select bool_and(coalesce(qual, with_check) like '%[0-9a-f-]{36}%') from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'stage10b_avatar_%'), 'avatar keys have generated-id shape');
select ok((select bool_and(coalesce(qual, with_check) like '%stage3%') from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'stage10b_artifact_%'), 'artifact keys use known filenames');

select * from finish();
rollback;
