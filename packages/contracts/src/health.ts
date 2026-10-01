import { z } from 'zod';

/** Resposta de `GET /health/live`: o processo está de pé. */
export const healthLiveResponseSchema = z.object({
  status: z.literal('ok'),
});
export type HealthLiveResponse = z.infer<typeof healthLiveResponseSchema>;

/** Resposta de `GET /health/ready` quando API e banco estão disponíveis. */
export const healthReadyResponseSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('ok'),
});
export type HealthReadyResponse = z.infer<typeof healthReadyResponseSchema>;
