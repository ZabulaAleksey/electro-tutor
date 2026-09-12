\set ON_ERROR_STOP on
\getenv provisioner_password ET_DB_PROVISIONER_PASSWORD
\getenv auth_runtime_password ET_DB_AUTH_RUNTIME_PASSWORD
\if :{?provisioner_password}
\else
  \echo 'ET_DB_PROVISIONER_PASSWORD is required'
  \quit 3
\endif
\if :{?auth_runtime_password}
\else
  \echo 'ET_DB_AUTH_RUNTIME_PASSWORD is required'
  \quit 3
\endif

SELECT format(
  'ALTER ROLE electro_tutor_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB '
  'NOCREATEROLE NOREPLICATION NOBYPASSRLS'
)\gexec

SELECT format(
  'CREATE ROLE electro_tutor_auth_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB '
  'NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'auth_runtime_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'electro_tutor_auth_runtime')\gexec
SELECT format(
  'ALTER ROLE electro_tutor_auth_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB '
  'NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'auth_runtime_password'
)\gexec

SELECT format(
  'CREATE ROLE electro_tutor_provisioner LOGIN NOINHERIT NOSUPERUSER NOCREATEDB '
  'NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'provisioner_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'electro_tutor_provisioner')\gexec
SELECT format(
  'ALTER ROLE electro_tutor_provisioner LOGIN NOINHERIT NOSUPERUSER NOCREATEDB '
  'NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'provisioner_password'
)\gexec

DO $$
DECLARE
  membership record;
BEGIN
  FOR membership IN
    SELECT granted.rolname AS granted_role, member.rolname AS member_role
    FROM pg_auth_members AS relation
    JOIN pg_roles AS granted ON granted.oid = relation.roleid
    JOIN pg_roles AS member ON member.oid = relation.member
    WHERE granted.rolname IN ('electro_tutor_runtime', 'electro_tutor_auth_runtime')
       OR member.rolname IN ('electro_tutor_runtime', 'electro_tutor_auth_runtime')
  LOOP
    EXECUTE format('REVOKE %I FROM %I', membership.granted_role, membership.member_role);
  END LOOP;
END
$$;

GRANT CONNECT ON DATABASE electro_tutor TO electro_tutor_provisioner;
GRANT CONNECT ON DATABASE electro_tutor_test TO electro_tutor_provisioner;
GRANT CONNECT ON DATABASE electro_tutor TO electro_tutor_auth_runtime;
GRANT CONNECT ON DATABASE electro_tutor_test TO electro_tutor_auth_runtime;

\connect electro_tutor
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO electro_tutor_migrator;
GRANT USAGE ON SCHEMA public TO electro_tutor_runtime;
GRANT USAGE ON SCHEMA public TO electro_tutor_provisioner;
GRANT USAGE ON SCHEMA public TO electro_tutor_auth_runtime;

\connect electro_tutor_test
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO electro_tutor_migrator;
GRANT USAGE ON SCHEMA public TO electro_tutor_runtime;
GRANT USAGE ON SCHEMA public TO electro_tutor_provisioner;
GRANT USAGE ON SCHEMA public TO electro_tutor_auth_runtime;
