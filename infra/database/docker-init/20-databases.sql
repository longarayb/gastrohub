-- =====================================================================
-- GastroHub — init do container: bancos e privilégios
--
-- Cria `gastrohub` (desenvolvimento) e `gastrohub_test` (testes
-- automatizados) com os mesmos parâmetros e o mesmo modelo de papéis.
-- Somente criação: este script NÃO contém DROP.
-- Ver docs/02-BANCO-DE-DADOS.md §2 e docs/decisions/ADR-003.
-- =====================================================================

\set ON_ERROR_STOP on

CREATE DATABASE gastrohub
  WITH OWNER = gastrohub_owner
       ENCODING = 'UTF8'
       LOCALE_PROVIDER = 'icu'
       ICU_LOCALE = 'pt-BR'
       LC_COLLATE = 'C'
       LC_CTYPE = 'C'
       TEMPLATE = template0;

CREATE DATABASE gastrohub_test
  WITH OWNER = gastrohub_owner
       ENCODING = 'UTF8'
       LOCALE_PROVIDER = 'icu'
       ICU_LOCALE = 'pt-BR'
       LC_COLLATE = 'C'
       LC_CTYPE = 'C'
       TEMPLATE = template0;

-- Privilégios idênticos nos dois bancos.
\set db gastrohub
\ir 21-privileges.psql

\set db gastrohub_test
\ir 21-privileges.psql
