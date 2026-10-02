// Leitura de senha sem eco no terminal (M02 §6.9). Nunca escreve a senha na saída.
import { type Readable, type Writable } from 'node:stream';

export interface CliIo {
  stdin: Readable & { isTTY?: boolean; setRawMode?: (mode: boolean) => unknown };
  stdout: Writable;
  stderr: Writable;
}

export class CliAbortError extends Error {
  override name = 'CliAbortError';
}

/** Pergunta com eco (e-mail, nome). */
export async function promptVisible(io: CliIo, question: string): Promise<string> {
  io.stdout.write(question);
  return readLine(io);
}

/** Pergunta sem eco: exige TTY. */
export async function promptHidden(io: CliIo, question: string): Promise<string> {
  if (!io.stdin.isTTY || !io.stdin.setRawMode) {
    throw new CliAbortError(
      'Senha só pode ser lida de um terminal interativo ou com --password-stdin.',
    );
  }
  io.stdout.write(question);
  io.stdin.setRawMode(true);
  try {
    return await readLine(io);
  } finally {
    io.stdin.setRawMode(false);
    io.stdout.write('\n');
  }
}

/**
 * Lê todo o stdin (modo --password-stdin), removendo só a quebra de linha final e um BOM
 * inicial (o PowerShell 5.1 prefixa o pipe com BOM UTF-8; nunca faz parte da senha).
 */
const BOM_PREFIX = new RegExp('^' + String.fromCharCode(0xfeff));

export async function readAllStdin(io: CliIo): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of io.stdin) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(BOM_PREFIX, '')
    .replace(/\r?\n$/, '');
}

function readLine(io: CliIo): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (data: Buffer | string) => {
      for (const char of data.toString('utf8')) {
        if (char === '\u0003') {
          cleanup();
          reject(new CliAbortError('Cancelado.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = [...value].slice(0, -1).join('');
          continue;
        }
        value += char;
      }
    };
    const onEnd = () => {
      cleanup();
      resolve(value);
    };
    const cleanup = () => {
      io.stdin.off('data', onData);
      io.stdin.off('end', onEnd);
      io.stdin.pause();
    };
    io.stdin.on('data', onData);
    io.stdin.on('end', onEnd);
    io.stdin.resume();
  });
}
