import { healthReadyResponseSchema } from '@gastrohub/contracts';

export type ComponentStatus = 'ok' | 'down' | 'unknown';

export interface SystemStatus {
  api: ComponentStatus;
  database: ComponentStatus;
}

/**
 * Consulta /health/ready e traduz o resultado:
 * - 200 válido      → API ok, banco ok
 * - resposta HTTP   → API ok, banco indisponível (ex.: 503 Problem Details)
 * - falha de rede   → API indisponível, banco desconhecido
 */
export async function fetchSystemStatus(fetchImpl: typeof fetch = fetch): Promise<SystemStatus> {
  let response: Response;
  try {
    response = await fetchImpl('/health/ready', { headers: { Accept: 'application/json' } });
  } catch {
    return { api: 'down', database: 'unknown' };
  }

  if (!response.ok) {
    return { api: 'ok', database: 'down' };
  }

  const parsed = healthReadyResponseSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? { api: 'ok', database: 'ok' } : { api: 'ok', database: 'unknown' };
}
