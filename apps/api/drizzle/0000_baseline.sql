-- M01 — Fundação técnica: migration baseline.
--
-- Não cria tabelas nem regras de negócio. Existe para provar o pipeline de migrations:
-- aplicação como gastrohub_owner, registro em drizzle.__drizzle_migrations e
-- funcionamento do ALTER DEFAULT PRIVILEGES para gastrohub_app.
-- Ver docs/modules/M01-fundacao-tecnica.md §9.
SELECT 1;
