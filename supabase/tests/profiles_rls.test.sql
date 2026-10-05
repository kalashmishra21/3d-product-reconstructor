begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table('public', 'profiles', 'profiles table exists');
select has_column('public', 'profiles', 'id', 'profile id exists');
select has_column('public', 'profiles', 'display_name', 'display name exists');
select has_column('public', 'profiles', 'avatar_path', 'avatar path exists');
select is((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), true, 'profiles RLS enabled');
select is((select count(*) from pg_policies where schemaname='public' and tablename='profiles' and cmd='SELECT'), 1::bigint, 'owner SELECT policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='profiles' and cmd='INSERT'), 1::bigint, 'owner INSERT policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='profiles' and cmd='UPDATE'), 1::bigint, 'owner UPDATE policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='profiles' and cmd='DELETE'), 0::bigint, 'no profile DELETE policy');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='profiles' and grantee='anon'), 0::bigint, 'anonymous profile grants absent');

select * from finish();
rollback;
