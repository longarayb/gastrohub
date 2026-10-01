import { v7 as uuidv7 } from 'uuid';

export const REQUEST_ID_HEADER = 'x-request-id';

// Aceita o request id do cliente apenas se for seguro para logs (evita log injection).
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Reutiliza o X-Request-Id do cliente quando seguro; caso contrário gera um UUIDv7. */
export function resolveRequestId(header: string | string[] | undefined): string {
  const candidate = Array.isArray(header) ? header[0] : header;
  return candidate && SAFE_REQUEST_ID.test(candidate) ? candidate : uuidv7();
}
