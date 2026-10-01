-- =====================================================================
-- GastroHub — init do container: papéis
--
-- Executado automaticamente pelo entrypoint da imagem postgres na
-- PRIMEIRA inicialização do volume (como superusuário postgres).
-- As senhas vêm das variáveis de ambiente do container (geradas por
-- `pnpm env:init` no .env) e nunca aparecem em arquivos versionados.
-- =====================================================================

\set ON_ERROR_STOP on

\getenv owner_pw GASTROHUB_OWNER_PASSWORD
\getenv app_pw GASTROHUB_APP_PASSWORD

\if :{?owner_pw}
\else
  DO $$ BEGIN RAISE EXCEPTION 'GASTROHUB_OWNER_PASSWORD não definida'; END $$;
\endif

\if :{?app_pw}
\else
  DO $$ BEGIN RAISE EXCEPTION 'GASTROHUB_APP_PASSWORD não definida'; END $$;
\endif

-- Dono dos bancos e do schema: executa migrations (DDL).
-- Não é usado pela API em runtime.
CREATE ROLE gastrohub_owner LOGIN PASSWORD :'owner_pw'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;

-- Runtime da API: somente DML, sujeito a RLS, sem DDL.
CREATE ROLE gastrohub_app LOGIN PASSWORD :'app_pw'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;

\unset owner_pw
\unset app_pw
