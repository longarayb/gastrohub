-- =====================================================================
-- GastroHub — validação da configuração do banco (somente leitura)
--
-- Container (oficial):
--   pnpm db:validate
--   (= docker compose exec -T postgres psql -U postgres -d <banco> -f - < este arquivo)
--
-- PostgreSQL nativo (fallback):
--   psql -h localhost -U postgres -d gastrohub -f infra/database/99-validate.sql
-- =====================================================================

\echo '== Versão do PostgreSQL =='
SELECT version();

\echo '== Banco atual (esperado: provider=icu, locale=pt-BR, UTF8, owner=gastrohub_owner) =='
SELECT d.datname                                   AS banco,
       pg_get_userbyid(d.datdba)                   AS owner,
       pg_encoding_to_char(d.encoding)             AS encoding,
       CASE d.datlocprovider WHEN 'i' THEN 'icu'
                             WHEN 'c' THEN 'libc'
                             WHEN 'b' THEN 'builtin' END AS provider,
       d.datlocale                                 AS locale,
       d.datcollate                                AS lc_collate,
       d.datctype                                  AS lc_ctype
FROM pg_database d
WHERE d.datname = current_database();

\echo '== Papéis (esperado: tudo f, exceto rolcanlogin) =='
SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolcanlogin
FROM pg_roles
WHERE rolname LIKE 'gastrohub\_%'
ORDER BY rolname;

\echo '== Privilégios no banco (esperado: app = só CONNECT; owner = tudo) =='
SELECT r.rolname,
       has_database_privilege(r.rolname, current_database(), 'CONNECT')   AS connect,
       has_database_privilege(r.rolname, current_database(), 'CREATE')    AS "create",
       has_database_privilege(r.rolname, current_database(), 'TEMPORARY') AS temporary
FROM pg_roles r
WHERE r.rolname LIKE 'gastrohub\_%'
ORDER BY r.rolname;

\echo '== Schema public (esperado: owner = pg_database_owner; app = USAGE sem CREATE) =='
SELECT pg_get_userbyid(n.nspowner) AS owner_public,
       has_schema_privilege('gastrohub_app', 'public', 'USAGE')    AS app_usage,
       has_schema_privilege('gastrohub_app', 'public', 'CREATE')   AS app_create,
       has_schema_privilege('gastrohub_owner', 'public', 'CREATE') AS owner_create
FROM pg_namespace n
WHERE n.nspname = 'public';

\echo '== Default privileges (esperado: app recebe arwd em tabelas, rU em sequências, X em funções) =='
SELECT pg_get_userbyid(d.defaclrole)  AS objetos_criados_por,
       coalesce(n.nspname, '(todos)') AS schema,
       CASE d.defaclobjtype WHEN 'r' THEN 'tabelas'
                            WHEN 'S' THEN 'sequências'
                            WHEN 'f' THEN 'funções'
                            WHEN 'T' THEN 'tipos'
                            WHEN 'n' THEN 'schemas' END AS tipo,
       d.defaclacl                    AS acl
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
ORDER BY 1, 2, 3;

\echo '== Objetos pertencentes ao gastrohub_app (esperado: 0 e 0) =='
SELECT (SELECT count(*) FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
         WHERE r.rolname = 'gastrohub_app')     AS relacoes,
       (SELECT count(*) FROM pg_namespace s JOIN pg_roles r ON r.oid = s.nspowner
         WHERE r.rolname = 'gastrohub_app')     AS schemas;

\echo '== Tabelas fora dos catálogos (esperado após migrations: drizzle.__drizzle_migrations + users, sessions, auth_events) =='
SELECT table_schema, table_name, pg_get_userbyid(c.relowner) AS owner
FROM information_schema.tables t
JOIN pg_class c ON c.relname = t.table_name
JOIN pg_namespace s ON s.oid = c.relnamespace AND s.nspname = t.table_schema
WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1, 2;

\echo '== Privilégios do runtime por tabela (esperado: users/sessions sem DELETE; auth_events só INSERT,SELECT) =='
SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS gastrohub_app
FROM information_schema.role_table_grants
WHERE grantee = 'gastrohub_app' AND table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;

\echo '== Schema drizzle (esperado: app sem USAGE; vazio se migrations ainda não rodaram) =='
SELECT n.nspname AS schema,
       pg_get_userbyid(n.nspowner)                            AS owner,
       has_schema_privilege('gastrohub_app', n.oid, 'USAGE')  AS app_usage
FROM pg_namespace n
WHERE n.nspname = 'drizzle';

\echo '== Ordenação pt-BR (esperado: a, á, b, ç, d, É, z) =='
SELECT string_agg(x, ', ' ORDER BY x) AS ordenacao
FROM (VALUES ('z'), ('É'), ('b'), ('á'), ('ç'), ('a'), ('d')) AS t(x);
