-- =====================================================================
-- GastroHub — validação da configuração do banco (somente leitura)
--
--   psql -h localhost -U postgres -d gastrohub -f infra/database/99-validate.sql
-- =====================================================================

\echo '== Versão do PostgreSQL =='
SELECT version();

\echo '== Banco gastrohub (esperado: provider=icu, locale=pt-BR, UTF8, owner=gastrohub_owner) =='
SELECT d.datname                                   AS banco,
       pg_get_userbyid(d.datdba)                   AS owner,
       pg_encoding_to_char(d.encoding)             AS encoding,
       CASE d.datlocprovider WHEN 'i' THEN 'icu'
                             WHEN 'c' THEN 'libc'
                             WHEN 'b' THEN 'builtin' END AS provider,
       d.datlocale                                 AS locale,
       d.datcollate                                AS lc_collate,
       d.datctype                                  AS lc_ctype,
       d.datcollversion                            AS versao_collation
FROM pg_database d
WHERE d.datname = 'gastrohub';

\echo '== Papéis (esperado: rolsuper=f, rolbypassrls=f) =='
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole
FROM pg_roles
WHERE rolname LIKE 'gastrohub\_%'
ORDER BY rolname;

\echo '== Dono do schema public =='
SELECT nspname AS schema, pg_get_userbyid(nspowner) AS owner
FROM pg_namespace
WHERE nspname = 'public';

\echo '== Tabelas no schema public (esperado: 0 até o M01) =='
SELECT count(*) AS tabelas
FROM information_schema.tables
WHERE table_schema = 'public';

\echo '== Ordenação pt-BR (esperado: a, á, b, ç, d, É, z) =='
SELECT x FROM (VALUES ('z'), ('É'), ('b'), ('á'), ('ç'), ('a'), ('d')) AS t(x) ORDER BY x;
