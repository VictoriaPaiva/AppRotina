-- READ ONLY. Run as the effective migration role, not as an application session.
-- Does not create roles/functions, inspect JWTs or access domain/user data.
begin transaction read only;
select current_user as effective_migration_role, session_user as connection_role,
 current_setting('server_version_num') as server_version_num,
 r.rolsuper,r.rolcreaterole,r.rolbypassrls
from pg_roles r where r.rolname=current_user;

select n.nspname,pg_get_userbyid(n.nspowner) as schema_owner,
 has_schema_privilege(current_user,n.oid,'USAGE') as installer_usage,
 has_schema_privilege(current_user,n.oid,'CREATE') as installer_create,
 has_schema_privilege(current_user,n.oid,'USAGE WITH GRANT OPTION') as can_delegate_usage,
 pg_has_role(current_user,n.nspowner,'USAGE') as inherits_owner_privileges
from pg_namespace n where n.nspname in ('public','routine_private','auth');

select p.oid::regprocedure as function_name,pg_get_userbyid(p.proowner) as owner,
 p.prosecdef,p.proconfig,
 has_function_privilege(current_user,p.oid,'EXECUTE') as installer_execute,
 has_function_privilege(current_user,p.oid,'EXECUTE WITH GRANT OPTION') as can_delegate_execute
from pg_proc p where p.oid in (
 to_regprocedure('auth.uid()'),
 to_regprocedure('routine_private.assert_activity(uuid,uuid)'));

select c.oid::regclass as object_name,pg_get_userbyid(c.relowner) as owner,
 pg_has_role(current_user,c.relowner,'USAGE') as inherits_owner_privileges,
 has_table_privilege(current_user,c.oid,'REFERENCES') as can_reference,
 has_table_privilege(current_user,c.oid,'SELECT WITH GRANT OPTION') as can_delegate_select,
 c.relrowsecurity,c.relforcerowsecurity
from pg_class c where c.oid in (
 to_regclass('auth.users'),to_regclass('public.activities'),to_regclass('public.goals'),
 to_regclass('public.areas'),to_regclass('public.reminder_configs'),
 to_regclass('public.commitment_configs'),to_regclass('public.planning_contexts'),
 to_regclass('public.fixed_schedules'),to_regclass('public.recurrence_rules'),
 to_regclass('public.time_windows'));

-- Zero rows for the executor is expected BEFORE installation.
select rolname,rolcanlogin,rolsuper,rolbypassrls,rolinherit,rolcreaterole,
 rolcreatedb,rolreplication from pg_roles where rolname='routine_progress_executor';

select pg_get_userbyid(m.roleid) as granted_role,
 pg_get_userbyid(m.member) as member_role,
 m.admin_option,m.inherit_option,m.set_option
from pg_auth_members m
where m.roleid=to_regrole('routine_progress_executor')
 or m.member=to_regrole('routine_progress_executor');

-- Optional post-install checks (empty before installation).
select p.oid::regprocedure as function_name,pg_get_userbyid(p.proowner) as owner,
 p.prosecdef,p.proconfig
from pg_proc p where p.proowner=to_regrole('routine_progress_executor');

select c.oid::regclass as historical_table,pg_get_userbyid(c.relowner) as owner,
 c.relrowsecurity,c.relforcerowsecurity,
 has_table_privilege('authenticated',c.oid,'INSERT') as browser_insert,
 has_table_privilege('authenticated',c.oid,'UPDATE') as browser_update,
 has_table_privilege('authenticated',c.oid,'DELETE') as browser_delete
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname in (
 'user_temporal_preferences','progress_attempts','activity_progress_logs',
 'activity_goal_versions','progress_log_goal_versions','activity_progress_voids');
rollback;
