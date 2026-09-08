\set ON_ERROR_STOP on
\getenv migrator_password ET_DB_MIGRATOR_PASSWORD
\getenv runtime_password ET_DB_RUNTIME_PASSWORD
\getenv provisioner_password ET_DB_PROVISIONER_PASSWORD
\if :{?migrator_password}
\else
  \echo 'ET_DB_MIGRATOR_PASSWORD is required'
  \quit 3
\endif
\if :{?runtime_password}
\else
  \echo 'ET_DB_RUNTIME_PASSWORD is required'
  \quit 3
\endif
\if :{?provisioner_password}
\else
  \echo 'ET_DB_PROVISIONER_PASSWORD is required'
  \quit 3
\endif

SELECT 'CREATE DATABASE electro_tutor'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'electro_tutor')\gexec
SELECT 'CREATE DATABASE electro_tutor_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'electro_tutor_test')\gexec
\connect electro_tutor

SELECT format('CREATE ROLE electro_tutor_migrator LOGIN PASSWORD %L', :'migrator_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'electro_tutor_migrator')\gexec
SELECT format('ALTER ROLE electro_tutor_migrator LOGIN PASSWORD %L', :'migrator_password')\gexec
SELECT format('CREATE ROLE electro_tutor_runtime LOGIN PASSWORD %L', :'runtime_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'electro_tutor_runtime')\gexec
SELECT format('ALTER ROLE electro_tutor_runtime LOGIN PASSWORD %L', :'runtime_password')\gexec
SELECT format('CREATE ROLE electro_tutor_provisioner LOGIN PASSWORD %L', :'provisioner_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'electro_tutor_provisioner')\gexec
SELECT format('ALTER ROLE electro_tutor_provisioner LOGIN PASSWORD %L', :'provisioner_password')\gexec

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE electro_tutor
TO electro_tutor_migrator, electro_tutor_runtime, electro_tutor_provisioner;
GRANT USAGE, CREATE ON SCHEMA public TO electro_tutor_migrator;
GRANT USAGE ON SCHEMA public TO electro_tutor_runtime;
GRANT USAGE ON SCHEMA public TO electro_tutor_provisioner;

\connect electro_tutor_test
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE electro_tutor_test
TO electro_tutor_migrator, electro_tutor_runtime, electro_tutor_provisioner;
GRANT USAGE, CREATE ON SCHEMA public TO electro_tutor_migrator;
GRANT USAGE ON SCHEMA public TO electro_tutor_runtime;
GRANT USAGE ON SCHEMA public TO electro_tutor_provisioner;
