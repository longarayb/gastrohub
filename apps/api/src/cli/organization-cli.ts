// CLI operacional de empresas, filiais e vínculos (M03 §9, D2). Conecta como gastrohub_app;
// cada comando age sobre UMA empresa (identificada pelo id) e aplica o contexto dela (§6.3).
//
//   company:create --legal-name <razão> --trade-name <fantasia> --cnpj <cnpj>
//   company:suspend <companyId> | company:activate <companyId>
//   branch:create <companyId> --name <nome> [--cnpj --timezone --cutoff HH:MM --cep
//                 --street --number --complement --district --city --state]
//   member:add <companyId> <email> | member:remove <companyId> <email>
import { type Writable } from 'node:stream';

import { UserAdminError } from '../modules/identity/index.js';
import {
  OrganizationAdminError,
  type OrganizationAdminService,
} from '../modules/organization/application/organization-admin.service.js';
import { formatCnpj } from '../modules/organization/domain/cnpj.js';

const USAGE = `Uso:
  organization-cli company:create --legal-name <razão social> --trade-name <nome fantasia> --cnpj <cnpj>
  organization-cli company:suspend <companyId>
  organization-cli company:activate <companyId>
  organization-cli branch:create <companyId> --name <nome> [--cnpj <cnpj>] [--timezone <IANA>]
                   [--cutoff HH:MM] [--cep <cep>] [--street ..] [--number ..] [--complement ..]
                   [--district ..] [--city ..] [--state <UF>]
  organization-cli member:add <companyId> <email>
  organization-cli member:remove <companyId> <email>
`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class UsageError extends Error {
  override name = 'UsageError';
}

const BRANCH_OPTIONS = [
  'name',
  'cnpj',
  'timezone',
  'cutoff',
  'cep',
  'street',
  'number',
  'complement',
  'district',
  'city',
  'state',
] as const;
const COMPANY_OPTIONS = ['legal-name', 'trade-name', 'cnpj'] as const;

function parse(args: string[], allowed: readonly string[]) {
  const positional: string[] = [];
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (!allowed.includes(key)) throw new UsageError(`Opção desconhecida: ${arg}`);
      const value = args[++i];
      if (value === undefined) throw new UsageError(`Informe um valor para ${arg}.`);
      options[key] = value;
    } else positional.push(arg);
  }
  return { positional, options };
}

function companyIdArg(positional: string[]): string {
  const id = positional[0];
  if (!id || !UUID.test(id)) throw new UsageError('Informe o id (UUID) da empresa.');
  return id;
}

export interface OrganizationCliIo {
  stdout: Writable;
  stderr: Writable;
}

/** Executa a CLI. Devolve o código de saída (0 ok, 1 erro, 2 uso). */
export async function runOrganizationCli(
  args: string[],
  io: OrganizationCliIo,
  admin: OrganizationAdminService,
): Promise<number> {
  const [command, ...rest] = args;
  try {
    switch (command) {
      case 'company:create': {
        const { options } = parse(rest, COMPANY_OPTIONS);
        const company = await admin.createCompany({
          legalName: options['legal-name'] ?? '',
          tradeName: options['trade-name'] ?? '',
          cnpj: options.cnpj ?? '',
        });
        io.stdout.write(
          `Empresa criada: ${company.tradeName} (CNPJ ${formatCnpj(company.taxId)})\nid: ${company.id}\n`,
        );
        return 0;
      }
      case 'company:suspend':
      case 'company:activate': {
        const { positional } = parse(rest, []);
        const companyId = companyIdArg(positional);
        await admin.setCompanyStatus(
          companyId,
          command === 'company:suspend' ? 'suspended' : 'active',
        );
        io.stdout.write(
          command === 'company:suspend'
            ? 'Empresa suspensa. Os membros perdem o acesso na próxima requisição.\n'
            : 'Empresa reativada.\n',
        );
        return 0;
      }
      case 'branch:create': {
        const { positional, options } = parse(rest, BRANCH_OPTIONS);
        const companyId = companyIdArg(positional);
        const branch = await admin.createBranch(companyId, {
          name: options.name ?? '',
          ...options,
        });
        io.stdout.write(`Filial criada.\nid: ${branch.id}\n`);
        return 0;
      }
      case 'member:add':
      case 'member:remove': {
        const { positional } = parse(rest, []);
        const companyId = companyIdArg(positional);
        const email = positional[1];
        if (!email) throw new UsageError('Informe o e-mail do usuário.');
        if (command === 'member:add') {
          await admin.addMember(companyId, email);
          io.stdout.write('Usuário vinculado à empresa.\n');
        } else {
          await admin.removeMember(companyId, email);
          io.stdout.write('Vínculo revogado. O acesso termina na próxima requisição.\n');
        }
        return 0;
      }
      default:
        io.stderr.write(USAGE);
        return 2;
    }
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr.write(`${error.message}\n${USAGE}`);
      return 2;
    }
    if (error instanceof OrganizationAdminError || error instanceof UserAdminError) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
