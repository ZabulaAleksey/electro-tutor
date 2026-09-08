\set ON_ERROR_STOP on
\getenv provisioner_password ET_DB_PROVISIONER_PASSWORD
\if :{?provisioner_password}
\else
  \echo 'ET_DB_PROVISIONER_PASSWORD is required'
  \quit 3
\endif

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

GRANT CONNECT ON DATABASE electro_tutor TO electro_tutor_provisioner;
GRANT CONNECT ON DATABASE electro_tutor_test TO electro_tutor_provisioner;

\connect electro_tutor
GRANT USAGE ON SCHEMA public TO electro_tutor_provisioner;

\connect electro_tutor_test
GRANT USAGE ON SCHEMA public TO electro_tutor_provisioner;
