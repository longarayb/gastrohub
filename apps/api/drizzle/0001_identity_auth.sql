CREATE TABLE "auth_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"user_id" uuid,
	"session_id" uuid,
	"identifier_hash" "bytea",
	"ip" "inet",
	"user_agent" text,
	"request_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "auth_events_event_type_check" CHECK ("auth_events"."event_type" IN ('login_succeeded', 'login_failed', 'login_rate_limited', 'logout', 'session_revoked', 'sessions_revoked_others', 'password_changed', 'password_change_failed', 'user_created', 'user_disabled', 'user_enabled', 'password_set_by_operator')),
	CONSTRAINT "auth_events_identifier_hash_length_check" CHECK (octet_length("auth_events"."identifier_hash") = 32),
	CONSTRAINT "auth_events_user_agent_length_check" CHECK (char_length("auth_events"."user_agent") <= 512),
	CONSTRAINT "auth_events_request_id_length_check" CHECK (char_length("auth_events"."request_id") <= 128)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"ip" "inet",
	"user_agent" text,
	CONSTRAINT "sessions_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "sessions_token_hash_length_check" CHECK (octet_length("sessions"."token_hash") = 32),
	CONSTRAINT "sessions_expires_after_created_check" CHECK ("sessions"."expires_at" > "sessions"."created_at"),
	CONSTRAINT "sessions_revoked_reason_check" CHECK ("sessions"."revoked_reason" IN ('logout', 'revoked_by_user', 'revoked_others', 'password_changed', 'replaced', 'session_limit', 'user_disabled', 'operator')),
	CONSTRAINT "sessions_revoked_consistency_check" CHECK (("sessions"."revoked_at" IS NULL) = ("sessions"."revoked_reason" IS NULL)),
	CONSTRAINT "sessions_user_agent_length_check" CHECK (char_length("sessions"."user_agent") <= 512)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_key" UNIQUE("email"),
	CONSTRAINT "users_email_normalized_check" CHECK ("users"."email" = lower("users"."email") AND "users"."email" = btrim("users"."email")),
	CONSTRAINT "users_email_length_check" CHECK (char_length("users"."email") BETWEEN 3 AND 254),
	CONSTRAINT "users_email_format_check" CHECK (position('@' in "users"."email") > 1),
	CONSTRAINT "users_name_length_check" CHECK (char_length(btrim("users"."name")) BETWEEN 1 AND 120),
	CONSTRAINT "users_password_hash_argon2id_check" CHECK ("users"."password_hash" LIKE '$argon2id$%'),
	CONSTRAINT "users_status_check" CHECK ("users"."status" IN ('active', 'disabled'))
);
--> statement-breakpoint
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_events_identifier_time_idx" ON "auth_events" USING btree ("identifier_hash","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "auth_events_ip_time_idx" ON "auth_events" USING btree ("ip","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "auth_events_user_time_idx" ON "auth_events" USING btree ("user_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sessions_user_active_idx" ON "sessions" USING btree ("user_id","created_at" DESC NULLS LAST) WHERE "sessions"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
-- Privilégios mínimos do runtime (M02 §10.1, D13). Os default privileges do M01 concedem
-- SELECT/INSERT/UPDATE/DELETE; aqui removemos o que o runtime não deve ter.
-- Revogação de sessão é UPDATE, nunca DELETE; auth_events é append-only.
REVOKE DELETE ON TABLE "users", "sessions" FROM gastrohub_app;--> statement-breakpoint
REVOKE UPDATE, DELETE ON TABLE "auth_events" FROM gastrohub_app;