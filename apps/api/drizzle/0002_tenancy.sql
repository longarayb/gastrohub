CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tax_id" text,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"business_day_cutoff" time DEFAULT '04:00' NOT NULL,
	"postal_code" text,
	"street" text,
	"number" text,
	"complement" text,
	"district" text,
	"city" text,
	"state" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_company_id_name_key" UNIQUE("company_id","name"),
	CONSTRAINT "branches_company_id_id_key" UNIQUE("company_id","id"),
	CONSTRAINT "branches_tax_id_key" UNIQUE("tax_id"),
	CONSTRAINT "branches_tax_id_format_check" CHECK ("branches"."tax_id" ~ '^[0-9A-Z]{12}[0-9]{2}$'),
	CONSTRAINT "branches_name_length_check" CHECK (char_length(btrim("branches"."name")) BETWEEN 1 AND 100),
	CONSTRAINT "branches_postal_code_check" CHECK ("branches"."postal_code" ~ '^[0-9]{8}$'),
	CONSTRAINT "branches_state_check" CHECK ("branches"."state" IN ('AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO')),
	CONSTRAINT "branches_address_length_check" CHECK (coalesce(char_length("branches"."street"), 0) <= 150 AND coalesce(char_length("branches"."number"), 0) <= 150
          AND coalesce(char_length("branches"."complement"), 0) <= 150
          AND coalesce(char_length("branches"."district"), 0) <= 150
          AND coalesce(char_length("branches"."city"), 0) <= 150),
	CONSTRAINT "branches_status_check" CHECK ("branches"."status" IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text NOT NULL,
	"tax_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_tax_id_key" UNIQUE("tax_id"),
	CONSTRAINT "companies_tax_id_format_check" CHECK ("companies"."tax_id" ~ '^[0-9A-Z]{12}[0-9]{2}$'),
	CONSTRAINT "companies_legal_name_length_check" CHECK (char_length(btrim("companies"."legal_name")) BETWEEN 1 AND 150),
	CONSTRAINT "companies_trade_name_length_check" CHECK (char_length(btrim("companies"."trade_name")) BETWEEN 1 AND 100),
	CONSTRAINT "companies_status_check" CHECK ("companies"."status" IN ('active', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_company_id_user_id_key" UNIQUE("company_id","user_id"),
	CONSTRAINT "memberships_status_check" CHECK ("memberships"."status" IN ('active', 'revoked'))
);
--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_revoked_reason_check";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "active_company_id" uuid;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memberships_user_active_idx" ON "memberships" USING btree ("user_id") WHERE "memberships"."status" = 'active';--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revoked_reason_check" CHECK ("sessions"."revoked_reason" IN ('logout', 'revoked_by_user', 'revoked_others', 'password_changed', 'replaced', 'session_limit', 'user_disabled', 'operator', 'company_switched'));--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Escrito à mão (M03 §3.4, §6.2, §3.5). Revisar com cuidado.
-- ---------------------------------------------------------------------------
-- FKs entre módulos (não declaradas nos schemas Drizzle para respeitar o ADR-001).
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_company_id_companies_id_fk" FOREIGN KEY ("active_company_id") REFERENCES "public"."companies"("id");--> statement-breakpoint
-- RLS (ADR-003): ENABLE + FORCE; sem contexto, nada é visível (falha fechada).
-- NULLIF: depois que uma variável app.* é usada numa conexão, current_setting(..., true) devolve ''
-- (não NULL) nas transações seguintes; sem o NULLIF, ''::uuid geraria erro em conexões reaproveitadas.
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- branches: somente a empresa ativa.
CREATE POLICY "tenant_isolation" ON "branches"
  USING      ("company_id" = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK ("company_id" = NULLIF(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
-- memberships: vínculos da empresa ativa OU do próprio usuário; escrita só na empresa ativa.
CREATE POLICY "tenant_or_own" ON "memberships"
  USING      ("company_id" = NULLIF(current_setting('app.company_id', true), '')::uuid
              OR "user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK ("company_id" = NULLIF(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
-- companies: a empresa ativa OU as empresas com vínculo ativo do usuário; escrita só na ativa.
-- (A política de memberships não consulta companies: sem recursão.)
CREATE POLICY "tenant_or_member" ON "companies"
  USING ("id" = NULLIF(current_setting('app.company_id', true), '')::uuid
         OR "id" IN (SELECT "company_id" FROM "memberships"
                      WHERE "user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid
                        AND "status" = 'active'))
  WITH CHECK ("id" = NULLIF(current_setting('app.company_id', true), '')::uuid);--> statement-breakpoint
-- Privilégios do runtime: nada é apagado (D8); sem DDL.
REVOKE DELETE ON TABLE "companies", "branches", "memberships" FROM gastrohub_app;