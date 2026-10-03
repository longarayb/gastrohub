import { z } from 'zod';

import { sessionInfoSchema } from './auth.js';

// M03 — Empresas e Filiais (docs/modules/M03-empresas-filiais.md §8).

export const activeCompanySchema = z.object({
  id: z.uuid(),
  tradeName: z.string(),
});
export type ActiveCompany = z.infer<typeof activeCompanySchema>;

export const myCompanySchema = z.object({
  id: z.uuid(),
  tradeName: z.string(),
  legalName: z.string(),
  /** Empresa ativa nesta sessão. */
  active: z.boolean(),
});
export type MyCompany = z.infer<typeof myCompanySchema>;

export const myCompaniesSchema = z.object({ data: z.array(myCompanySchema) });
export type MyCompanies = z.infer<typeof myCompaniesSchema>;

export const switchActiveCompanyRequestSchema = z.strictObject({
  companyId: z.uuid(),
});
export type SwitchActiveCompanyRequest = z.infer<typeof switchActiveCompanyRequestSchema>;

export const activeCompanySwitchedSchema = z.object({
  session: sessionInfoSchema,
  csrfToken: z.string(),
  activeCompany: activeCompanySchema,
});
export type ActiveCompanySwitched = z.infer<typeof activeCompanySwitchedSchema>;

export const companySchema = z.object({
  id: z.uuid(),
  legalName: z.string(),
  tradeName: z.string(),
  /** CNPJ normalizado (14 caracteres, numérico ou alfanumérico). */
  taxId: z.string(),
  status: z.enum(['active', 'suspended']),
});
export type Company = z.infer<typeof companySchema>;

export const addressSchema = z.object({
  postalCode: z.string().nullable(),
  street: z.string().nullable(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  district: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
});
export type Address = z.infer<typeof addressSchema>;

export const branchSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  taxId: z.string().nullable(),
  timezone: z.string(),
  /** Virada do dia operacional, HH:MM. */
  businessDayCutoff: z.string().regex(/^\d{2}:\d{2}$/),
  address: addressSchema,
  status: z.enum(['active', 'inactive']),
});
export type Branch = z.infer<typeof branchSchema>;

export const branchListSchema = z.object({ data: z.array(branchSchema) });
export type BranchList = z.infer<typeof branchListSchema>;

/** Códigos de erro do M03 (membro `code`, D10). */
export const ORGANIZATION_ERROR_CODES = [
  'active_company_required',
  'company_access_revoked',
  'company_not_found',
] as const;
