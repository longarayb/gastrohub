// CLI operacional de usuários (M02 §6.9, D1/D2). Conecta como gastrohub_app (runtime).
//
//   user-cli create [--email <e> --name <n> --password-stdin]
//   user-cli set-password <email> [--password-stdin]
//   user-cli disable <email>
//   user-cli enable <email>
//   user-cli seed-dev                 (somente NODE_ENV=development)
//
// Senhas: somente TTY sem eco (com confirmação) ou --password-stdin. Nunca por argumento.
import {
  UserAdminError,
  UserAdminService,
} from '../modules/identity/application/user-admin.service.js';
import { AuthEventsRepository } from '../modules/identity/infrastructure/auth-events.repository.js';
import { IdentityRepository } from '../modules/identity/infrastructure/identity.repository.js';
import { PasswordHasher } from '../modules/identity/infrastructure/password-hasher.js';
import { type Database } from '../shared/database/database.module.js';
import {
  CliAbortError,
  type CliIo,
  promptHidden,
  promptVisible,
  readAllStdin,
} from './hidden-input.js';

export const DEV_SEED_EMAIL = 'dev@gastrohub.local';
export const DEV_SEED_NAME = 'Usuário de desenvolvimento';

const USAGE = `Uso:
  user-cli create [--email <email> --name <nome> --password-stdin]
  user-cli set-password <email> [--password-stdin]
  user-cli disable <email>
  user-cli enable <email>
  user-cli seed-dev
`;

export interface CliEnv {
  nodeEnv: string;
}

interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  options: Map<string, string | true>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const options = new Map<string, string | true>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--password-stdin') options.set('password-stdin', true);
    else if (arg === '--email' || arg === '--name') options.set(arg.slice(2), args[++i] ?? '');
    else if (arg.startsWith('--')) throw new CliUsageError(`Opção desconhecida: ${arg}`);
    else positional.push(arg);
  }
  return { command: positional.shift(), positional, options };
}

class CliUsageError extends Error {
  override name = 'CliUsageError';
}

/** Lê e confirma a nova senha, mostrando as violações da política antes de gravar. */
async function readNewPassword(
  io: CliIo,
  fromStdin: boolean,
  violations: (password: string) => string[],
): Promise<string> {
  if (fromStdin) return readAllStdin(io);
  for (;;) {
    const password = await promptHidden(io, 'Senha: ');
    const problems = violations(password);
    if (problems.length > 0) {
      io.stderr.write(`${problems.join(' ')}\n`);
      continue;
    }
    const confirmation = await promptHidden(io, 'Confirme a senha: ');
    if (confirmation === password) return password;
    io.stderr.write('As senhas não conferem.\n');
  }
}

export function createUserAdmin(db: Database): UserAdminService {
  const repo = new IdentityRepository(db);
  return new UserAdminService(repo, new AuthEventsRepository(db), new PasswordHasher());
}

/** Executa a CLI. Devolve o código de saída (0 ok, 1 erro, 2 uso). */
export async function runUserCli(
  args: string[],
  io: CliIo,
  admin: UserAdminService,
  env: CliEnv,
): Promise<number> {
  try {
    const { command, positional, options } = parseArgs(args);
    const fromStdin = options.has('password-stdin');

    switch (command) {
      case 'create': {
        if (fromStdin && (!options.has('email') || !options.has('name'))) {
          throw new CliUsageError('Com --password-stdin, informe --email e --name.');
        }
        const email = admin.normalizeAndValidateEmail(
          (options.get('email') as string | undefined) ?? (await promptVisible(io, 'E-mail: ')),
        );
        const name =
          (options.get('name') as string | undefined) ?? (await promptVisible(io, 'Nome: '));
        const password = await readNewPassword(io, fromStdin, (p) =>
          admin.passwordViolations(p, email, name),
        );
        const user = await admin.createUser(email, name, password);
        io.stdout.write(`Usuário criado: ${user.email} (${user.id}).\n`);
        return 0;
      }
      case 'set-password': {
        const email = admin.normalizeAndValidateEmail(requireEmail(positional));
        const password = await readNewPassword(io, fromStdin, (p) =>
          admin.passwordViolations(p, email, ''),
        );
        await admin.setPassword(email, password);
        io.stdout.write('Senha redefinida. Todas as sessões do usuário foram encerradas.\n');
        return 0;
      }
      case 'disable':
        await admin.disable(requireEmail(positional));
        io.stdout.write('Usuário desativado. Todas as sessões foram encerradas.\n');
        return 0;
      case 'enable':
        await admin.enable(requireEmail(positional));
        io.stdout.write('Usuário reativado.\n');
        return 0;
      case 'seed-dev': {
        if (env.nodeEnv !== 'development') {
          throw new UserAdminError('seed-dev só pode ser executado com NODE_ENV=development.');
        }
        io.stdout.write(`Criando usuário de desenvolvimento ${DEV_SEED_EMAIL}.\n`);
        const password = await readNewPassword(io, fromStdin, (p) =>
          admin.passwordViolations(p, DEV_SEED_EMAIL, DEV_SEED_NAME),
        );
        await admin.createUser(DEV_SEED_EMAIL, DEV_SEED_NAME, password);
        io.stdout.write(`Usuário criado: ${DEV_SEED_EMAIL}.\n`);
        return 0;
      }
      default:
        io.stderr.write(USAGE);
        return 2;
    }
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.stderr.write(`${error.message}\n${USAGE}`);
      return 2;
    }
    if (error instanceof UserAdminError || error instanceof CliAbortError) {
      io.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

function requireEmail(positional: string[]): string {
  const email = positional[0];
  if (!email) throw new CliUsageError('Informe o e-mail do usuário.');
  return email;
}
