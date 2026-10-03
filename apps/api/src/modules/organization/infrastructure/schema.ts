// Tabelas do módulo organization (docs/modules/M03-empresas-filiais.md §3).
// Tabelas de tenant: RLS + FORCE por company_id (políticas na migration 0002_tenancy).
// FKs para tabelas de outros módulos (users) são criadas em SQL na migration (ADR-001).
import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, time, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const COMPANY_STATUSES = ['active', 'suspended'] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];
export const BRANCH_STATUSES = ['active', 'inactive'] as const;
export type BranchStatus = (typeof BRANCH_STATUSES)[number];
export const MEMBERSHIP_STATUSES = ['active', 'revoked'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

const CNPJ_PATTERN = '^[0-9A-Z]{12}[0-9]{2}$';
const UF_LIST = sql.raw(
  [
    'AC',
    'AL',
    'AP',
    'AM',
    'BA',
    'CE',
    'DF',
    'ES',
    'GO',
    'MA',
    'MT',
    'MS',
    'MG',
    'PA',
    'PB',
    'PR',
    'PE',
    'PI',
    'RJ',
    'RN',
    'RS',
    'RO',
    'RR',
    'SC',
    'SP',
    'SE',
    'TO',
  ]
    .map((uf) => `'${uf}'`)
    .join(', '),
);
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const companies = pgTable(
  'companies',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    legalName: text('legal_name').notNull(),
    tradeName: text('trade_name').notNull(),
    taxId: text('tax_id').notNull(),
    status: text('status').$type<CompanyStatus>().notNull().default('active'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('companies_tax_id_key').on(t.taxId),
    check('companies_tax_id_format_check', sql`${t.taxId} ~ ${sql.raw(`'${CNPJ_PATTERN}'`)}`),
    check(
      'companies_legal_name_length_check',
      sql`char_length(btrim(${t.legalName})) BETWEEN 1 AND 150`,
    ),
    check(
      'companies_trade_name_length_check',
      sql`char_length(btrim(${t.tradeName})) BETWEEN 1 AND 100`,
    ),
    check('companies_status_check', sql`${t.status} IN (${inList(COMPANY_STATUSES)})`),
  ],
);

export const branches = pgTable(
  'branches',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    timezone: text('timezone').notNull().default('America/Sao_Paulo'),
    businessDayCutoff: time('business_day_cutoff').notNull().default('04:00'),
    postalCode: text('postal_code'),
    street: text('street'),
    number: text('number'),
    complement: text('complement'),
    district: text('district'),
    city: text('city'),
    state: text('state'),
    status: text('status').$type<BranchStatus>().notNull().default('active'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('branches_company_id_name_key').on(t.companyId, t.name),
    // Permite FKs compostas (company_id, branch_id) nas tabelas operacionais futuras (docs/02 §3).
    unique('branches_company_id_id_key').on(t.companyId, t.id),
    unique('branches_tax_id_key').on(t.taxId),
    check('branches_tax_id_format_check', sql`${t.taxId} ~ ${sql.raw(`'${CNPJ_PATTERN}'`)}`),
    check('branches_name_length_check', sql`char_length(btrim(${t.name})) BETWEEN 1 AND 100`),
    check('branches_postal_code_check', sql`${t.postalCode} ~ '^[0-9]{8}$'`),
    check('branches_state_check', sql`${t.state} IN (${UF_LIST})`),
    check(
      'branches_address_length_check',
      sql`coalesce(char_length(${t.street}), 0) <= 150 AND coalesce(char_length(${t.number}), 0) <= 150
          AND coalesce(char_length(${t.complement}), 0) <= 150
          AND coalesce(char_length(${t.district}), 0) <= 150
          AND coalesce(char_length(${t.city}), 0) <= 150`,
    ),
    check('branches_status_check', sql`${t.status} IN (${inList(BRANCH_STATUSES)})`),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    /** FK para users (módulo identity) criada em SQL na migration. */
    userId: uuid('user_id').notNull(),
    status: text('status').$type<MembershipStatus>().notNull().default('active'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('memberships_company_id_user_id_key').on(t.companyId, t.userId),
    index('memberships_user_active_idx')
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
    check('memberships_status_check', sql`${t.status} IN (${inList(MEMBERSHIP_STATUSES)})`),
  ],
);
