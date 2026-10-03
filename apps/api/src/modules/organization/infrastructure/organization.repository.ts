// Acesso a companies, branches e memberships (M03 §3). Todas as funções recebem uma
// transação do TenantDb: o isolamento é garantido pelas políticas RLS do contexto.
import { Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

import { type TenantTx } from '../../../shared/tenancy/tenant-db.js';
import { branches, companies, type CompanyStatus, memberships } from './schema.js';

export interface CompanySummary {
  id: string;
  tradeName: string;
  legalName: string;
}

export interface CompanyRecord extends CompanySummary {
  taxId: string;
  status: CompanyStatus;
}

export interface NewBranch {
  name: string;
  taxId: string | null;
  timezone: string;
  businessDayCutoff: string;
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
}

@Injectable()
export class OrganizationRepository {
  /** Empresas com vínculo ativo do usuário (contexto app.user_id). */
  async listUserCompanies(tx: TenantTx, userId: string): Promise<CompanySummary[]> {
    return tx
      .select({ id: companies.id, tradeName: companies.tradeName, legalName: companies.legalName })
      .from(memberships)
      .innerJoin(companies, eq(companies.id, memberships.companyId))
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.status, 'active'),
          eq(companies.status, 'active'),
        ),
      )
      .orderBy(asc(companies.tradeName));
  }

  /** Vínculo ativo do usuário em empresa ativa (contexto da própria empresa). */
  async findActiveMembership(
    tx: TenantTx,
    companyId: string,
    userId: string,
  ): Promise<{ id: string; tradeName: string } | null> {
    const [row] = await tx
      .select({ id: companies.id, tradeName: companies.tradeName })
      .from(memberships)
      .innerJoin(companies, eq(companies.id, memberships.companyId))
      .where(
        and(
          eq(memberships.companyId, companyId),
          eq(memberships.userId, userId),
          eq(memberships.status, 'active'),
          eq(companies.status, 'active'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findCompany(tx: TenantTx, companyId: string): Promise<CompanyRecord | null> {
    const [row] = await tx
      .select({
        id: companies.id,
        tradeName: companies.tradeName,
        legalName: companies.legalName,
        taxId: companies.taxId,
        status: companies.status,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    return row ?? null;
  }

  async listBranches(tx: TenantTx) {
    return tx.select().from(branches).orderBy(asc(branches.name));
  }

  // ------------------------------------------------------------------ admin (CLI)

  async insertCompany(
    tx: TenantTx,
    data: { id: string; legalName: string; tradeName: string; taxId: string },
  ): Promise<CompanyRecord> {
    const [row] = await tx.insert(companies).values(data).returning({
      id: companies.id,
      tradeName: companies.tradeName,
      legalName: companies.legalName,
      taxId: companies.taxId,
      status: companies.status,
    });
    return row!;
  }

  async setCompanyStatus(tx: TenantTx, companyId: string, status: CompanyStatus) {
    const rows = await tx
      .update(companies)
      .set({ status, updatedAt: sql`now()` })
      .where(eq(companies.id, companyId))
      .returning({ id: companies.id });
    return rows.length > 0;
  }

  async insertBranch(tx: TenantTx, companyId: string, data: NewBranch): Promise<{ id: string }> {
    const [row] = await tx
      .insert(branches)
      .values({ companyId, ...data })
      .returning({ id: branches.id });
    return row!;
  }

  /** Cria o vínculo ou reativa um vínculo revogado. */
  async upsertMembership(tx: TenantTx, companyId: string, userId: string): Promise<void> {
    await tx
      .insert(memberships)
      .values({ companyId, userId })
      .onConflictDoUpdate({
        target: [memberships.companyId, memberships.userId],
        set: { status: 'active', updatedAt: sql`now()` },
      });
  }

  async revokeMembership(tx: TenantTx, companyId: string, userId: string): Promise<boolean> {
    const rows = await tx
      .update(memberships)
      .set({ status: 'revoked', updatedAt: sql`now()` })
      .where(
        and(
          eq(memberships.companyId, companyId),
          eq(memberships.userId, userId),
          eq(memberships.status, 'active'),
        ),
      )
      .returning({ id: memberships.id });
    return rows.length > 0;
  }
}
