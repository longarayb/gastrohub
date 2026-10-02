// Tabelas do módulo identity (docs/modules/M02-autenticacao.md §4).
// Globais (sem company_id) e sem RLS de tenant (§10.2).
import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/** `bytea` (drizzle-orm 0.45 não tem o tipo nativo). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const USER_STATUSES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const REVOKED_REASONS = [
  'logout',
  'revoked_by_user',
  'revoked_others',
  'password_changed',
  'replaced',
  'session_limit',
  'user_disabled',
  'operator',
] as const;
export type RevokedReason = (typeof REVOKED_REASONS)[number];

export const AUTH_EVENT_TYPES = [
  'login_succeeded',
  'login_failed',
  'login_rate_limited',
  'logout',
  'session_revoked',
  'sessions_revoked_others',
  'password_changed',
  'password_change_failed',
  'user_created',
  'user_disabled',
  'user_enabled',
  'password_set_by_operator',
] as const;
export type AuthEventType = (typeof AUTH_EVENT_TYPES)[number];

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    status: text('status').$type<UserStatus>().notNull().default('active'),
    passwordChangedAt: timestamptz('password_changed_at').notNull().defaultNow(),
    lastLoginAt: timestamptz('last_login_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('users_email_key').on(t.email),
    check(
      'users_email_normalized_check',
      sql`${t.email} = lower(${t.email}) AND ${t.email} = btrim(${t.email})`,
    ),
    check('users_email_length_check', sql`char_length(${t.email}) BETWEEN 3 AND 254`),
    check('users_email_format_check', sql`position('@' in ${t.email}) > 1`),
    check('users_name_length_check', sql`char_length(btrim(${t.name})) BETWEEN 1 AND 120`),
    check('users_password_hash_argon2id_check', sql`${t.passwordHash} LIKE '$argon2id$%'`),
    check('users_status_check', sql`${t.status} IN (${inList(USER_STATUSES)})`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: bytea('token_hash').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    revokedReason: text('revoked_reason').$type<RevokedReason>(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [
    unique('sessions_token_hash_key').on(t.tokenHash),
    check('sessions_token_hash_length_check', sql`octet_length(${t.tokenHash}) = 32`),
    check('sessions_expires_after_created_check', sql`${t.expiresAt} > ${t.createdAt}`),
    check('sessions_revoked_reason_check', sql`${t.revokedReason} IN (${inList(REVOKED_REASONS)})`),
    check(
      'sessions_revoked_consistency_check',
      sql`(${t.revokedAt} IS NULL) = (${t.revokedReason} IS NULL)`,
    ),
    check('sessions_user_agent_length_check', sql`char_length(${t.userAgent}) <= 512`),
    index('sessions_user_active_idx')
      .on(t.userId, t.createdAt.desc())
      .where(sql`${t.revokedAt} IS NULL`),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

export const authEvents = pgTable(
  'auth_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    occurredAt: timestamptz('occurred_at').notNull().defaultNow(),
    eventType: text('event_type').$type<AuthEventType>().notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    identifierHash: bytea('identifier_hash'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    check('auth_events_event_type_check', sql`${t.eventType} IN (${inList(AUTH_EVENT_TYPES)})`),
    check('auth_events_identifier_hash_length_check', sql`octet_length(${t.identifierHash}) = 32`),
    check('auth_events_user_agent_length_check', sql`char_length(${t.userAgent}) <= 512`),
    check('auth_events_request_id_length_check', sql`char_length(${t.requestId}) <= 128`),
    index('auth_events_identifier_time_idx').on(t.identifierHash, t.occurredAt.desc()),
    index('auth_events_ip_time_idx').on(t.ip, t.occurredAt.desc()),
    index('auth_events_user_time_idx').on(t.userId, t.occurredAt.desc()),
  ],
);
