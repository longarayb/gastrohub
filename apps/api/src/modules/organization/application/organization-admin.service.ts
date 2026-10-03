// Operações administrativas da CLI (M03 §9, D2).
// D12: registradas nos logs operacionais; NÃO substituem a auditoria de negócio (audit_logs, M04).
import { Inject, Injectable, Logger } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { UserAdminService } from '../../identity/index.js';
import {
  DEFAULT_BUSINESS_DAY_CUTOFF,
  DEFAULT_TIMEZONE,
  isValidCutoff,
  isValidPostalCode,
  isValidTimezone,
  isValidUf,
  normalizePostalCode,
} from '../domain/branch-rules.js';
import { isValidCnpj, normalizeCnpj } from '../domain/cnpj.js';
import {
  type CompanyRecord,
  OrganizationRepository,
} from '../infrastructure/organization.repository.js';

export class OrganizationAdminError extends Error {
  override name = 'OrganizationAdminError';
}

export interface BranchInput {
  name: string;
  cnpj?: string;
  timezone?: string;
  cutoff?: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
}

const isPgError = (error: unknown, code: string, constraint?: string) => {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  };
  const pg = e.cause ?? e;
  return pg.code === code && (!constraint || pg.constraint === constraint);
};

function text(value: string | undefined, max: number, label: string): string | null {
  const trimmed = value?.normalize('NFC').trim();
  if (!trimmed) return null;
  if (trimmed.length > max)
    throw new OrganizationAdminError(`${label}: máximo de ${max} caracteres.`);
  return trimmed;
}

@Injectable()
export class OrganizationAdminService {
  private readonly logger = new Logger('OrganizationAdmin');

  constructor(
    @Inject(TenantDb) private readonly tenantDb: TenantDb,
    @Inject(OrganizationRepository) private readonly repo: OrganizationRepository,
    @Inject(UserAdminService) private readonly users: UserAdminService,
  ) {}

  private requireCnpj(raw: string): string {
    const cnpj = normalizeCnpj(raw);
    if (!isValidCnpj(cnpj)) throw new OrganizationAdminError('CNPJ inválido.');
    return cnpj;
  }

  async createCompany(input: {
    legalName: string;
    tradeName: string;
    cnpj: string;
  }): Promise<CompanyRecord> {
    const legalName = text(input.legalName, 150, 'Razão social');
    const tradeName = text(input.tradeName, 100, 'Nome fantasia');
    if (!legalName || !tradeName) {
      throw new OrganizationAdminError('Informe razão social e nome fantasia.');
    }
    const taxId = this.requireCnpj(input.cnpj);
    const id = uuidv7();
    try {
      const company = await this.tenantDb.run({ companyId: id }, (tx) =>
        this.repo.insertCompany(tx, { id, legalName, tradeName, taxId }),
      );
      this.logger.log({ event: 'company_created', companyId: id });
      return company;
    } catch (error) {
      if (isPgError(error, '23505', 'companies_tax_id_key')) {
        throw new OrganizationAdminError('Já existe uma empresa com este CNPJ.');
      }
      throw error;
    }
  }

  async setCompanyStatus(companyId: string, status: 'active' | 'suspended'): Promise<void> {
    const updated = await this.tenantDb.run({ companyId }, (tx) =>
      this.repo.setCompanyStatus(tx, companyId, status),
    );
    if (!updated) throw new OrganizationAdminError('Empresa não encontrada.');
    this.logger.log({
      event: status === 'active' ? 'company_activated' : 'company_suspended',
      companyId,
    });
  }

  async createBranch(companyId: string, input: BranchInput): Promise<{ id: string }> {
    const name = text(input.name, 100, 'Nome');
    if (!name) throw new OrganizationAdminError('Informe o nome da filial.');
    const timezone = input.timezone ?? DEFAULT_TIMEZONE;
    if (!isValidTimezone(timezone))
      throw new OrganizationAdminError('Fuso horário inválido (IANA).');
    const cutoff = input.cutoff ?? DEFAULT_BUSINESS_DAY_CUTOFF;
    if (!isValidCutoff(cutoff)) throw new OrganizationAdminError('Virada do dia deve ser HH:MM.');
    const postalCode = input.cep ? normalizePostalCode(input.cep) : null;
    if (postalCode !== null && !isValidPostalCode(postalCode)) {
      throw new OrganizationAdminError('CEP inválido.');
    }
    const state = input.state ? input.state.trim().toUpperCase() : null;
    if (state !== null && !isValidUf(state)) throw new OrganizationAdminError('UF inválida.');

    try {
      const branch = await this.tenantDb.run({ companyId }, async (tx) => {
        if (!(await this.repo.findCompany(tx, companyId))) {
          throw new OrganizationAdminError('Empresa não encontrada.');
        }
        return this.repo.insertBranch(tx, companyId, {
          name,
          taxId: input.cnpj ? this.requireCnpj(input.cnpj) : null,
          timezone,
          businessDayCutoff: cutoff,
          postalCode,
          street: text(input.street, 150, 'Logradouro'),
          number: text(input.number, 150, 'Número'),
          complement: text(input.complement, 150, 'Complemento'),
          district: text(input.district, 150, 'Bairro'),
          city: text(input.city, 150, 'Cidade'),
          state,
        });
      });
      this.logger.log({ event: 'branch_created', companyId, branchId: branch.id });
      return branch;
    } catch (error) {
      if (isPgError(error, '23505', 'branches_company_id_name_key')) {
        throw new OrganizationAdminError('Já existe uma filial com este nome nesta empresa.');
      }
      if (isPgError(error, '23505', 'branches_tax_id_key')) {
        throw new OrganizationAdminError('Já existe uma filial com este CNPJ.');
      }
      throw error;
    }
  }

  async addMember(companyId: string, email: string): Promise<void> {
    const user = await this.users.findUserIdByEmail(email);
    await this.tenantDb.run({ companyId }, async (tx) => {
      if (!(await this.repo.findCompany(tx, companyId))) {
        throw new OrganizationAdminError('Empresa não encontrada.');
      }
      await this.repo.upsertMembership(tx, companyId, user.id);
    });
    this.logger.log({ event: 'membership_added', companyId, userId: user.id });
  }

  async removeMember(companyId: string, email: string): Promise<void> {
    const user = await this.users.findUserIdByEmail(email);
    const revoked = await this.tenantDb.run({ companyId }, (tx) =>
      this.repo.revokeMembership(tx, companyId, user.id),
    );
    if (!revoked) throw new OrganizationAdminError('Vínculo ativo não encontrado.');
    this.logger.log({ event: 'membership_revoked', companyId, userId: user.id });
  }
}
