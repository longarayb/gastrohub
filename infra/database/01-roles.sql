-- =====================================================================
-- GastroHub — papéis de banco (ambiente local)
--
-- Executar UMA vez, conectado como superusuário (postgres) ao banco
-- gastrohub:
--
--   psql -h localhost -U postgres -d gastrohub -f infra/database/01-roles.sql
--
-- Depois, definir as senhas interativamente (nunca versionar senhas):
--
--   psql -h localhost -U postgres -d gastrohub
--   \password gastrohub_owner
--   \password gastrohub_app
--
-- Por quê: superusuários e donos de tabela ignoram Row-Level Security.
-- A aplicação deve conectar como gastrohub_app (sem BYPASSRLS, não dona
-- das tabelas). Migrations rodam como gastrohub_owner.
-- Ver docs/02-BANCO-DE-DADOS.md §2 e docs/decisions/ADR-003.
-- =====================================================================

-- Dono do schema: executa migrations (DDL). Não é usado pela API em runtime.
CREATE ROLE gastrohub_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- Conexão da API em runtime: somente DML, sujeito a RLS.
CREATE ROLE gastrohub_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- O banco passa a pertencer ao gastrohub_owner. No PostgreSQL 15+, o schema
-- public pertence a pg_database_owner e, portanto, ao gastrohub_owner.
ALTER DATABASE gastrohub OWNER TO gastrohub_owner;

REVOKE ALL ON DATABASE gastrohub FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE gastrohub TO gastrohub_owner, gastrohub_app;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gastrohub_app;

-- Tudo o que o gastrohub_owner criar via migrations fica acessível
-- (somente DML) ao gastrohub_app.
ALTER DEFAULT PRIVILEGES FOR ROLE gastrohub_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gastrohub_app;
ALTER DEFAULT PRIVILEGES FOR ROLE gastrohub_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO gastrohub_app;
ALTER DEFAULT PRIVILEGES FOR ROLE gastrohub_owner IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO gastrohub_app;
