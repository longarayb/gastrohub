-- =====================================================================
-- GastroHub — (OPCIONAL, recomendado) recriar o banco com collation ICU
--
-- O banco foi criado com LC_COLLATE/LC_CTYPE = 'Portuguese_Brazil.1252'.
-- Esse nome de locale existe somente no Windows:
--   - dumps não restauram em Linux (CI, Docker, produção);
--   - a ordenação de textos fica diferente entre ambientes;
--   - atualizações do Windows podem mudar a collation e invalidar índices.
--
-- Com ICU 'pt-BR', a ordenação é a mesma em qualquer sistema operacional.
--
-- SÓ EXECUTE ENQUANTO O BANCO ESTIVER VAZIO. DROP DATABASE apaga tudo.
-- Executar conectado como postgres a OUTRO banco (ex.: postgres):
--
--   psql -h localhost -U postgres -d postgres -f infra/database/00-recreate-database-icu.sql
--
-- Em seguida, executar 01-roles.sql.
-- =====================================================================

DROP DATABASE IF EXISTS gastrohub;

CREATE DATABASE gastrohub
  WITH
  OWNER = postgres                -- 01-roles.sql transfere para gastrohub_owner
  ENCODING = 'UTF8'
  LOCALE_PROVIDER = 'icu'
  ICU_LOCALE = 'pt-BR'
  LC_COLLATE = 'C'                -- 'C' é portável e aceito com qualquer encoding
  LC_CTYPE = 'C'
  TEMPLATE = template0
  CONNECTION LIMIT = -1;
