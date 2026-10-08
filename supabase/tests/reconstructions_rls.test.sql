begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table('public', 'reconstructions', 'reconstructions table exists');
select has_column('public', 'reconstructions', 'user_id', 'owner id exists');
select has_column('public', 'reconstructions', 'source_path', 'source path exists');
select has_column('public', 'reconstructions', 'mesh_json_path', 'mesh path exists');
select has_column('public', 'reconstructions', 'obj_path', 'OBJ path exists');
select has_column('public', 'reconstructions', 'glb_path', 'GLB path exists');
select is((select relrowsecurity from pg_class where oid = 'public.reconstructions'::regclass), true, 'reconstructions RLS enabled');
select is((select count(*) from pg_policies where schemaname='public' and tablename='reconstructions' and cmd='SELECT'), 1::bigint, 'owner SELECT policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='reconstructions' and cmd='INSERT'), 1::bigint, 'owner INSERT policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='reconstructions' and cmd='UPDATE'), 1::bigint, 'owner UPDATE policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='reconstructions' and cmd='DELETE'), 1::bigint, 'owner DELETE policy');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='reconstructions' and grantee='anon'), 0::bigint, 'anonymous reconstruction grants absent');

select * from finish();
rollback;
